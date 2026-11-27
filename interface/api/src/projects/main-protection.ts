/**
 * Protection of a project's main branch: a change only enters it through a PR,
 * green checks. Project created by ADA: it applies the rule itself; adopted project: it
 * proposes it and the PO decides (their choice is kept outside GitHub).
 */
import type { Logger } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Octokit } from '@octokit/rest';
import type { AdaConfig } from '../ada/ada-config.js';
import type { Config } from '../config.js';
import { describeGithubError, translateGithubError } from '../github/errors.js';
import type { GithubService } from '../github/github.service.js';
import { parseIdentifier } from './repository.js';
import { ADOPTION_TOPIC } from './adoption.js';
import { parseStored } from '../legacy/legacy-storage.js';

const MAIN_RULE_NAME = 'main protégée';
const status = (e: unknown) => (e as { status?: number }).status;

/**
 * Protection of a project's main branch. “protected”: a rule already requires it (PR and
 * checks); “applied”: ADA just applied it; “impossible”: GitHub refuses (reason told to the
 * PO); “to-propose”: adopted project without a rule, ADA asks the PO whether to protect it (it
 * changes the way their team works); “refused”: the PO answered no.
 */
export type ProtectionState = 'protected' | 'applied' | 'impossible' | 'to-propose' | 'refused';
export interface Protection {
  state: ProtectionState;
  reason: string | null;
  link: string;
}

/** Rules in force on a branch (rulesets), as GitHub applies them. */
type BranchRule = { type: string; parameters?: { required_status_checks?: { context: string }[] } };

export class MainProtection {
  constructor(
    private readonly config: Config,
    private readonly github: GithubService,
    /** ada.json of the repository on a branch: its required checks are used when ADA applies the rule. */
    private readonly readRepositoryConfig: (gh: Octokit, owner: string, repo: string, ref?: string) => Promise<AdaConfig>,
    private readonly logger: Logger,
  ) {}

  /** Ruleset on main: PR required, green CI, neither deletion nor force push. Returns GitHub's refusal, if any. */
  private async applyRule(gh: Octokit, owner: string, repo: string, requiredChecks: string[]): Promise<{ ok: true } | { ok: false; status?: number; message: string }> {
    try {
      // Resumed creation: the rule may already exist.
      const { data: existingStories } = await gh.request('GET /repos/{owner}/{repo}/rulesets', { owner, repo });
      if ((existingStories ?? []).some((rule: { name?: string }) => rule.name === MAIN_RULE_NAME)) return { ok: true };
      await gh.request('POST /repos/{owner}/{repo}/rulesets', {
        owner,
        repo,
        name: MAIN_RULE_NAME,
        target: 'branch',
        enforcement: 'active',
        conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
        rules: [
          { type: 'deletion' },
          { type: 'non_fast_forward' },
          {
            type: 'pull_request',
            parameters: {
              required_approving_review_count: 0,
              dismiss_stale_reviews_on_push: false,
              require_code_owner_review: false,
              require_last_push_approval: false,
              required_review_thread_resolution: false,
            },
          },
          {
            type: 'required_status_checks',
            parameters: {
              strict_required_status_checks_policy: false,
              required_status_checks: requiredChecks.map((context) => ({ context })),
            },
          },
        ],
      });
      return { ok: true };
    } catch (e) {
      // The exact reason is logged: without it, there is no way to know why GitHub refused.
      this.logger.warn(`Protection of main refused on ${owner}/${repo}: ${describeGithubError(e)}`);
      return { ok: false, status: status(e), message: (e as Error).message ?? '' };
    }
  }

  async protect(gh: Octokit, owner: string, repo: string, requiredChecks: string[]): Promise<'done' | 'to-do'> {
    // Free personal account + private repository: rules unavailable (403/422).
    return (await this.applyRule(gh, owner, repo, requiredChecks)).ok ? 'done' : 'to-do';
  }

  /** Rules in force on a branch; null if GitHub does not show them. */
  private async branchRules(gh: Octokit, owner: string, repo: string, branch: string): Promise<BranchRule[] | null> {
    try {
      const { data } = await gh.request('GET /repos/{owner}/{repo}/rules/branches/{branch}', { owner, repo, branch: branch });
      return data as BranchRule[];
    } catch (e) {
      this.logger.warn(`Rules of ${owner}/${repo}@${branch} unreadable: ${describeGithubError(e)}`);
      return null;
    }
  }

  /**
   * Checks GitHub really requires before merging on this branch (protection rule).
   * null: no rule requires any. This list, and not `ada.json` (a repository file that
   * others can modify), is authoritative when it exists.
   */
  async enforcedChecks(gh: Octokit, owner: string, repo: string, branch: string): Promise<string[] | null> {
    const rules = await this.branchRules(gh, owner, repo, branch);
    const contexts = (rules ?? [])
      .filter((rule) => rule.type === 'required_status_checks')
      .flatMap((rule) => rule.parameters?.required_status_checks ?? [])
      .map((check) => check.context);
    return contexts.length ? [...new Set(contexts)] : null;
  }

  /** Last finding per project: at each opening, GitHub is not asked again (a refusal is kept longer). */
  private readonly findings = new Map<string, { protection: Protection; expire: number }>();

  private remember(key: string, protection: Protection): Protection {
    this.findings.set(key, { protection, expire: Date.now() + (protection.state === 'impossible' ? 60 : 10) * 60_000 });
    return protection;
  }

  /** The PO's choice for an adopted project (“do not protect”), kept by ADA outside GitHub. */
  private choiceFile(repository: string): string {
    parseIdentifier(repository, this.config.GITHUB_OWNER); // well-formed identifier: never a path
    return join(resolve(this.config.PREVIEWS_DIR), repository.toLowerCase(), 'protection.json');
  }

  private async refused(repository: string): Promise<boolean> {
    try {
      return parseStored<{ refused?: boolean }>(await readFile(this.choiceFile(repository), 'utf8')).refused === true;
    } catch {
      return false;
    }
  }

  /**
   * When a project is opened: the main branch must be protected (PR and green checks
   * required). Project created by ADA: if no rule requires it, ADA applies its own, with the
   * checks of `ada.json` (a protection that failed at creation is thus retried).
   * Adopted project: ADA applies nothing by itself; it proposes, and the PO decides.
   */
  async ensure(token: string, repository: string): Promise<Protection> {
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    const key = `${owner}/${repo}`.toLowerCase();
    const known = this.findings.get(key);
    if (known && known.expire > Date.now()) return known.protection;
    const gh = this.github.client(token);
    const link = `https://github.com/${owner}/${repo}/rules`;
    try {
      const { data: githubRepository } = await gh.repos.get({ owner, repo });
      const branch = githubRepository.default_branch ?? 'main';
      const rules = await this.branchRules(gh, owner, repo, branch);
      if ((rules ?? []).some((rule) => rule.type === 'pull_request')) return this.remember(key, { state: 'protected', reason: null, link });
      if ((githubRepository.topics ?? []).includes(ADOPTION_TOPIC)) {
        return this.remember(key, { state: (await this.refused(repository)) ? 'refused' : 'to-propose', reason: null, link });
      }
      return this.remember(key, await this.apply(gh, owner, repo, branch, githubRepository.private, link));
    } catch (e) {
      translateGithubError(e);
    }
  }

  private async apply(gh: Octokit, owner: string, repo: string, branch: string, isPrivate: boolean, link: string): Promise<Protection> {
    const { requiredChecks } = await this.readRepositoryConfig(gh, owner, repo, branch);
    const result = await this.applyRule(gh, owner, repo, requiredChecks);
    return result.ok ? { state: 'applied', reason: null, link } : { state: 'impossible', reason: protectionRefusalReason(result, isPrivate), link };
  }

  /** The PO accepts that ADA protects the main branch (adopted project): ADA applies the rule, under the PO's name. */
  async applyOnDemand(token: string, repository: string, login: string): Promise<Protection> {
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    const gh = this.github.client(token);
    const link = `https://github.com/${owner}/${repo}/rules`;
    try {
      const { data: githubRepository } = await gh.repos.get({ owner, repo });
      const protection = await this.apply(gh, owner, repo, githubRepository.default_branch ?? 'main', githubRepository.private, link);
      if (protection.state === 'applied') {
        await rm(this.choiceFile(repository), { force: true });
        this.logger.log(`Main branch of ${owner}/${repo} protected at the request of ${login}`);
      }
      return this.remember(`${owner}/${repo}`.toLowerCase(), protection);
    } catch (e) {
      translateGithubError(e);
    }
  }

  /** The PO does not want to protect the branch (adopted project): ADA remembers it and does not ask again. */
  async refuse(repository: string, login: string): Promise<Protection> {
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    const file = this.choiceFile(repository);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ refused: true, by: login, at: new Date().toISOString() }));
    return this.remember(`${owner}/${repo}`.toLowerCase(), { state: 'refused', reason: null, link: `https://github.com/${owner}/${repo}/rules` });
  }
}

/** Why GitHub did not accept the protection, told to the PO in plain words. */
function protectionRefusalReason(refusal: { status?: number; message: string }, isPrivate: boolean): string {
  if (isPrivate && (refusal.status === 403 || refusal.status === 422)) {
    return 'GitHub ne permet pas de protéger un dépôt privé sur un compte personnel gratuit.';
  }
  return `GitHub a refusé la règle${refusal.status ? ` (${refusal.status})` : ''} : ${refusal.message || 'sans motif donné'}.`;
}
