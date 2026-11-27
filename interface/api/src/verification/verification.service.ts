import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { AgentService } from '../agent/agent.service.js';
import { PreviewService } from '../preview/preview.service.js';
import { CONFIG, type Config } from '../config.js';
import { translateGithubError } from '../github/errors.js';
import { GithubService } from '../github/github.service.js';
import { DemoService } from '../demo/demo.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { StoriesService } from '../stories/stories.service.js';
import { numberFromUrl, canMerge, type Verification } from './verification.js';
import { readChecks, rerunChecks } from './github-checks.js';
import { parseIdentifier } from '../projects/repository.js';
import { branchOf } from '../agent/agent.js';

export const BRANCH_MODIFIED_REASON =
  'Des modifications ont été ajoutées à la branche en dehors d’ADA : ce n’est plus ce que vous avez vérifié dans l’aperçu. Un développeur doit les relire ; si elles sont voulues, la fusion se fait sur GitHub.';

@Injectable()
export class VerificationService {
  private readonly log = new Logger(VerificationService.name);

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly agent: AgentService,
    private readonly stories: StoriesService,
    private readonly preview: PreviewService,
    private readonly projects: ProjectsService,
    private readonly demo: DemoService,
  ) {}

  /** Number of commits of main missing from the branch (0: the branch is up to date). */
  private async delay(gh: ReturnType<GithubService['client']>, repository: string, base: string, head: string): Promise<number> {
    const { data } = await gh.repos.compareCommits({ ...parseIdentifier(repository, this.config.GITHUB_OWNER), base: head, head: base });
    return data.ahead_by;
  }

  /**
   * Number of the pull request of the request. The local activity mentions it, but this file may
   * be missing (previews folder lost, server replaced): GitHub stays the source of truth, and the
   * PR is found there by its branch. Without this, the request would stay “to review” without a PR and
   * would block the whole project.
   */
  private async pullRequestNumber(gh: ReturnType<GithubService['client']>, token: string, repository: string, number: number, knownUrl: string | null): Promise<number | null> {
    const known = numberFromUrl(knownUrl);
    if (known) return known;
    try {
      const detail = await this.stories.detail(token, repository, number);
      const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
      const { data } = await gh.pulls.list({ owner, repo, head: `${owner}:${branchOf({ number, title: detail.title, type: detail.type })}`, state: 'all', per_page: 5 });
      return data[0]?.number ?? null;
    } catch (e) {
      translateGithubError(e);
    }
  }

  /** The PR of the request, the state of its checks, and whether the PO can merge. */
  async verify(token: string, repository: string, number: number): Promise<Verification> {
    const activity = await this.agent.activity(repository, number);
    const pullRequestNumber = await this.pullRequestNumber(this.github.client(token), token, repository, number, activity.pullRequest);
    if (!pullRequestNumber) return { pullRequest: null, checks: [], mergeable: false, reason: 'Aucune pull request pour cette demande' };
    const gh = this.github.client(token);
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    try {
      const { data: pr } = await gh.pulls.get({ owner, repo, pull_number: pullRequestNumber });
      const state = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';
      // The checks GitHub really requires (protection rule); failing that, those of ada.json.
      const requiredChecks = (await this.projects.enforcedChecks(gh, owner, repo, pr.base.ref)) ?? (await this.projects.readRepositoryConfig(gh, owner, repo, pr.base.ref)).requiredChecks;
      const checks = await readChecks(gh, owner, repo, pr.head.sha, requiredChecks);
      // The branch must be exactly what ADA pushed and the PO saw in the preview: someone
      // adding a commit to it on GitHub did not go through ADA, and their green CI says nothing about what they wrote.
      const outsideAda = state === 'open' && activity.head && pr.head.sha !== activity.head;
      return {
        pullRequest: { number: pr.number, url: pr.html_url, state },
        checks,
        ...(outsideAda ? { mergeable: false, reason: BRANCH_MODIFIED_REASON } : canMerge(state, pr.mergeable, checks, pr.title)),
      };
    } catch (e) {
      translateGithubError(e);
    }
  }

  /** Reruns the checks GitHub did not run (or that failed), once the cause is fixed. */
  async rerunChecks(token: string, repository: string, number: number): Promise<Verification> {
    const gh = this.github.client(token);
    const pullRequestNumber = await this.pullRequestNumber(gh, token, repository, number, (await this.agent.activity(repository, number)).pullRequest);
    if (!pullRequestNumber) throw new ConflictException('Aucune pull request pour cette demande');
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    try {
      const { data: pr } = await gh.pulls.get({ owner, repo, pull_number: pullRequestNumber });
      await rerunChecks(gh, owner, repo, pr.head.sha);
    } catch (e) {
      translateGithubError(e);
    }
    return this.verify(token, repository, number);
  }

  /**
   * Merge by the PO (under their name), only if everything is green. Squash: a single
   * Conventional Commits commit on main (release-please), which closes the issue.
   */
  async merge(token: string, repository: string, number: number): Promise<Verification> {
    const verification = await this.verify(token, repository, number);
    if (!verification.mergeable || !verification.pullRequest) {
      throw new ConflictException(verification.reason ?? 'Fusion impossible pour l’instant');
    }
    const gh = this.github.client(token);
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    try {
      const { data: pr } = await gh.pulls.get({ owner, repo, pull_number: verification.pullRequest.number });
      // Branch behind main: it is updated first; the checks run again on the code
      // actually merged, and the PO approves again when they are green.
      if ((await this.delay(gh, repository, pr.base.ref, pr.head.sha)) > 0) {
        await gh.pulls.updateBranch({ owner, repo, pull_number: pr.number, expected_head_sha: pr.head.sha });
        // The update comes from ADA: the new tip of the branch is its own, not a third party's.
        const { data: branch } = await gh.repos.getBranch({ owner, repo, branch: pr.head.ref }).catch(() => ({ data: null }));
        await this.agent.recordHead(repository, number, branch?.commit.sha ?? null);
        return {
          ...verification,
          mergeable: false,
          reason:
            'Le projet a évolué depuis cette demande : elle vient d’être mise à jour et les contrôles sont relancés. Revenez valider quand ils sont verts.',
        };
      }
      await gh.pulls.merge({
        owner,
        repo,
        pull_number: pr.number,
        // The exact commit the checks verified: a push that arrived in the meantime makes the merge refused.
        sha: pr.head.sha,
        merge_method: 'squash',
        commit_title: `${pr.title} (#${pr.number})`,
        commit_message: `Closes #${number}`,
      });
    } catch (e) {
      translateGithubError(e);
    }
    // The merge is done: what follows (cleanup) must never make the answer to the PO fail.
    await this.afterMerge(token, repository, number);
    return this.verify(token, repository, number);
  }

  /**
   * “Closes #n” closes the issue together with the merge: it is closed only if it is
   * still open, then the status is removed and the preview put back on main. Each step is
   * independent: a failure is logged, without cancelling or hiding the merge.
   */
  private async afterMerge(token: string, repository: string, number: number): Promise<void> {
    const gh = this.github.client(token);
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    const steps: [string, () => Promise<unknown>][] = [
      [
        'issue closing',
        async () => {
          const { data: issue } = await gh.issues.get({ owner, repo, issue_number: number });
          if (issue.state === 'open') {
            await gh.issues.update({ owner, repo, issue_number: number, state: 'closed', state_reason: 'completed' });
          }
        },
      ],
      ['status removal', () => this.stories.removeStatus(token, repository, number)],
      ['parent request (breakdown) update', () => this.stories.reportDeliveryToParent(token, repository, number)],
      ['preview back on main', () => this.preview.returnToMain(token, repository)],
      ['restart of the preview application', () => this.preview.restartApplication(repository)],
      ['demo link update', () => this.demo.update(token, repository)],
    ];
    for (const [step, action] of steps) {
      try {
        await action();
      } catch (e) {
        this.log.warn(`After merging ${repository}#${number}, ${step}: ${(e as Error).message.split('\n')[0]}`);
      }
    }
  }
}
