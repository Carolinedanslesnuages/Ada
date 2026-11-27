import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { CONFIG, type Config } from '../config.js';
import { describeGithubError, translateGithubError } from '../github/errors.js';
import { GithubService } from '../github/github.service.js';
import { projectIdentifier, parseIdentifier, checkAccess } from './repository.js';
import { ProjectsService, ADOPTION_TOPIC, type GithubRepository } from './projects.service.js';
import { ADOPTION_BRANCH, TITLE_CHECK, adoptionPullRequest, ADOPTION_TITLE } from './adoption.js';
import { FREE_LABEL } from '../stories/story.js';
import { readChecks, rerunChecks } from '../verification/github-checks.js';
import { numberFromUrl, canMerge, type Check, type Verification } from '../verification/verification.js';
import { StoriesService } from '../stories/stories.service.js';
import { AgentService } from '../agent/agent.service.js';

export interface RepositoryToAdopt {
  id: string;
  name: string;
  owner: string;
  account: 'organization' | 'personal';
  description: string | null;
  url: string;
  /** Adoption PR already open, waiting for the PO's approval. */
  adoptionInProgress: string | null;
  /** The assistant analyses the project; the adoption PR will open at the end. */
  analysisInProgress: boolean;
}

/** State of a launched adoption: analysis, then PR to approve (same rules as for a request). */
export interface AdoptionState {
  analysisInProgress: boolean;
  pullRequest: Verification['pullRequest'];
  checks: Check[];
  mergeable: boolean;
  reason: string | null;
}

export interface AdoptionResult {
  /** Identifier of the project in ADA: it appears there as soon as the analysis is launched. */
  id: string;
  /** Analysis request (issue of the project), where the assistant publishes its summary and improvements. */
  analysis: string | null;
  /** Adoption PR, if it was already open. */
  pullRequest: string | null;
}

/** Start of the analysis request saved by an adoption: used to find it again to close it. */
export const ANALYSIS_REQUEST_START = 'Analyser ce projet comme s’il avait été créé avec ADA';

export type CancellationResult = { state: 'cancelled' | 'unlinked' };

export function analysisRequestText(stack: string | null, dsfr: boolean): string {
  return [
    `${ANALYSIS_REQUEST_START}, et proposer les améliorations pour qu’il en suive les règles (harnais et skills d’ADA).`,
    stack ? `Stack la plus proche : ${stack}.` : 'Stack : à déduire du projet.',
    dsfr ? 'Apparence : DSFR.' : 'Apparence : celle du projet, sans DSFR.',
  ].join('\n');
}

const adoptionSchema = z.object({
  repository: z.string().min(1).max(141),
  /** Optional: without it, the analysis deduces how to start the preview. */
  template: z.string().regex(/^[a-z0-9-]{1,60}$/).nullish(),
  /** Existing code: by default, ADA keeps the project's appearance and does not introduce the DSFR. */
  dsfr: z.boolean().default(false),
});
const status = (e: unknown) => (e as { status?: number }).status;

@Injectable()
export class AdoptionService {
  private readonly logger = new Logger(AdoptionService.name);

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly projects: ProjectsService,
    private readonly stories: StoriesService,
    private readonly agent: AgentService,
  ) {}

  /** Repositories of the organization and of the PO's account that are not in ADA yet. */
  async list(token: string, login: string): Promise<RepositoryToAdopt[]> {
    const gh = this.github.client(token);
    try {
      const repositories = (await this.projects.accessibleRepositories(gh, login)).filter(
        (d) => !d.archived && d.permissions?.push !== false && !this.projects.hasTopic(d, this.config.WORKSHOP_TOPIC, 'atelier-po', 'ada-creation'),
      );
      const projects = new Set((await this.projects.list(token, login)).map((project) => project.id));
      return Promise.all(
        repositories
          .map((d) => ({ d, id: projectIdentifier(d.owner.login, d.name, this.config.GITHUB_OWNER) }))
          .filter(({ id }) => !projects.has(id))
          .sort((a, b) => a.d.name.localeCompare(b.d.name))
          .map(async ({ d, id }) => ({
            id,
            name: d.name,
            owner: d.owner.login,
            account: d.owner.login.toLowerCase() === this.config.GITHUB_OWNER.toLowerCase() ? ('organization' as const) : ('personal' as const),
            description: d.description,
            url: d.html_url,
            ...(await this.adoptionState(gh, d, id)),
          })),
      );
    } catch (e) {
      translateGithubError(e);
    }
  }

  private async adoptionState(gh: Octokit, repository: GithubRepository, id: string): Promise<Pick<RepositoryToAdopt, 'adoptionInProgress' | 'analysisInProgress'>> {
    if (!this.projects.hasTopic(repository, ADOPTION_TOPIC)) return { adoptionInProgress: null, analysisInProgress: false };
    const adoptionInProgress = await adoptionPullRequest(gh, repository.owner.login, repository.name);
    return { adoptionInProgress, analysisInProgress: !adoptionInProgress && (await this.agent.activeLock(id)) !== null };
  }

  /**
   * Adoption: ADA tags the repository (provisional topic, labels), saves the analysis request
   * in the project under the PO's name and launches the assistant. At the end of its analysis, ADA opens the
   * adoption PR (deduced ada.json) and the assistant proposes the improvements. Nothing reaches main
   * without the PO's merge. An adoption already proposed returns its PR.
   */
  async adopt(token: string, login: string, data: unknown): Promise<AdoptionResult> {
    const input = adoptionSchema.safeParse(data);
    if (!input.success) throw new BadRequestException('Choisissez le dépôt à reprendre');
    const id = input.data.repository.toLowerCase();
    const { owner, repo } = parseIdentifier(id, this.config.GITHUB_OWNER);
    checkAccess({ owner, repo }, login, this.config.GITHUB_OWNER);
    const template = input.data.template ? this.projects.templates().templates.find((m) => m.id === input.data.template) : null;
    if (input.data.template && !template?.available) throw new BadRequestException('Cette stack n’est pas disponible');
    this.agent.checkAvailable();
    const gh = this.github.client(token);

    let repository: GithubRepository;
    try {
      ({ data: repository } = await gh.repos.get({ owner, repo }));
    } catch (e) {
      translateGithubError(e);
    }
    if (this.projects.hasTopic(repository, this.config.WORKSHOP_TOPIC, 'atelier-po')) throw new ConflictException('Ce projet est déjà dans ADA');
    if (repository.archived) throw new BadRequestException('Ce dépôt est archivé : il ne peut pas être repris');
    if (repository.default_branch !== 'main') {
      throw new BadRequestException(`La branche principale de ce dépôt s’appelle « ${repository.default_branch} » : ADA travaille sur « main ». Un développeur doit la renommer avant la reprise.`);
    }
    if (await this.agent.activeLock(id)) throw new ConflictException('ADA analyse déjà ce projet');

    try {
      const alreadyOpen = await adoptionPullRequest(gh, owner, repo);
      if (alreadyOpen) return { id, analysis: null, pullRequest: alreadyOpen };

      await gh.repos
        .replaceAllTopics({ owner, repo, names: [...new Set([...(repository.topics ?? []), ADOPTION_TOPIC])] })
        .catch((e: unknown) => {
          if (status(e) === 403 || status(e) === 404) {
            throw new ForbiddenException('Seul un administrateur de ce dépôt peut le faire reprendre par ADA.');
          }
          throw e;
        });
      await this.projects.applyLabels(gh, owner, repo);
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.logger.warn(`Adoption of ${owner}/${repo}: ${describeGithubError(e)}`);
      translateGithubError(e);
    }
    const workRequest = await this.stories.submitPrompt(token, id, analysisRequestText(template?.label ?? null, input.data.dsfr), login);
    await this.agent.analyzeAdoption(token, id, workRequest.number, login, { template: template?.id ?? null, dsfr: input.data.dsfr });
    return { id, analysis: `https://github.com/${owner}/${repo}/issues/${workRequest.number}`, pullRequest: null };
  }

  async state(token: string, repository: string): Promise<AdoptionState> {
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    const gh = this.github.client(token);
    const analysisInProgress = (await this.agent.activeLock(repository)) !== null;
    try {
      const number = numberFromUrl(await adoptionPullRequest(gh, owner, repo));
      if (!number) {
        return {
          analysisInProgress,
          pullRequest: null,
          checks: [],
          mergeable: false,
          reason: analysisInProgress ? 'ADA analyse le projet' : 'L’analyse s’est arrêtée sans pull request de reprise',
        };
      }
      const { data: pr } = await gh.pulls.get({ owner, repo, pull_number: number });
      const state = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';
      const checks = await readChecks(gh, owner, repo, pr.head.sha, [TITLE_CHECK]);
      return { analysisInProgress, pullRequest: { number: pr.number, url: pr.html_url, state }, checks, ...canMerge(state, pr.mergeable, checks, pr.title) };
    } catch (e) {
      translateGithubError(e);
    }
  }

  /** Reruns the checks of the adoption PR (e.g. after fixing GitHub billing). */
  async rerunChecks(token: string, repository: string): Promise<AdoptionState> {
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    const gh = this.github.client(token);
    try {
      const number = numberFromUrl(await adoptionPullRequest(gh, owner, repo));
      if (!number) throw new ConflictException('Aucune pull request de reprise');
      const { data: pr } = await gh.pulls.get({ owner, repo, pull_number: number });
      await rerunChecks(gh, owner, repo, pr.head.sha);
    } catch (e) {
      if (e instanceof ConflictException) throw e;
      translateGithubError(e);
    }
    return this.state(token, repository);
  }

  /**
   * The PO approves the adoption from ADA (green checks): squash merge, then the project gets
   * ADA's topic and becomes a project like the others.
   */
  async merge(token: string, repository: string): Promise<AdoptionState> {
    const state = await this.state(token, repository);
    if (!state.mergeable || !state.pullRequest) throw new ConflictException(state.reason ?? 'Fusion impossible pour l’instant');
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    const gh = this.github.client(token);
    try {
      await gh.pulls.merge({ owner, repo, pull_number: state.pullRequest.number, merge_method: 'squash', commit_title: `${ADOPTION_TITLE} (#${state.pullRequest.number})` });
      const { data } = await gh.repos.get({ owner, repo });
      // The “adoption” marking is kept: it tells an adopted project from a project created by ADA.
      const topics = [...(data.topics ?? []), this.config.WORKSHOP_TOPIC];
      await gh.repos.replaceAllTopics({ owner, repo, names: [...new Set(topics)] });
    } catch (e) {
      translateGithubError(e);
    }
    return { ...state, pullRequest: { ...state.pullRequest, state: 'merged' }, mergeable: false, reason: 'Déjà fusionnée' };
  }

  /**
   * Cancels an adoption, or unlinks an adopted project. Nothing is deleted, neither repository nor request.
   * - Adoption not approved yet: the adoption PR is closed and its branch removed (main was
   *   never modified), the analysis request is closed with an explanation, the marking is removed.
   * - Approved adoption, or project created by ADA: only ADA's marking is removed; files,
   *   stories and versions stay. The project can come back through “Adopt a project”.
   */
  async cancel(token: string, login: string, repository: string): Promise<CancellationResult> {
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    if (await this.agent.activeLock(repository)) throw new ConflictException('ADA travaille sur ce projet : attendez qu’elle ait terminé.');
    const gh = this.github.client(token);
    try {
      const { data } = await gh.repos.get({ owner, repo });
      const topics = data.topics ?? [];
      const others = topics.filter((topic) => ![ADOPTION_TOPIC, this.config.WORKSHOP_TOPIC, 'atelier-po'].includes(topic));
      // Project in ADA (created by it, or adopted and approved): only its marking is removed.
      if (topics.includes(this.config.WORKSHOP_TOPIC) || topics.includes('atelier-po')) {
        await gh.repos.replaceAllTopics({ owner, repo, names: others });
        return { state: 'unlinked' };
      }
      if (!topics.includes(ADOPTION_TOPIC)) throw new BadRequestException('Ce projet n’est pas dans ADA.');
      const pullRequestNumber = numberFromUrl(await adoptionPullRequest(gh, owner, repo));
      if (pullRequestNumber) {
        await gh.issues.createComment({ owner, repo, issue_number: pullRequestNumber, body: `Reprise annulée depuis ADA par ${login} : rien n'a été ajouté au projet.` });
        await gh.pulls.update({ owner, repo, pull_number: pullRequestNumber, state: 'closed' });
      }
      await gh.git.deleteRef({ owner, repo, ref: `heads/${ADOPTION_BRANCH}` }).catch((e: unknown) => {
        if (status(e) !== 404 && status(e) !== 422) throw e; // branch already gone
      });
      const open = (await gh.paginate(gh.issues.listForRepo, { owner, repo, state: 'open', labels: FREE_LABEL, per_page: 100 })) as { number: number; body?: string | null }[];
      for (const workRequest of open.filter((issue) => (issue.body ?? '').includes(ANALYSIS_REQUEST_START))) {
        await gh.issues.createComment({ owner, repo, issue_number: workRequest.number, body: `Reprise annulée depuis ADA par ${login} : cette analyse est close.` });
        await gh.issues.update({ owner, repo, issue_number: workRequest.number, state: 'closed', state_reason: 'not_planned' });
      }
      await gh.repos.replaceAllTopics({ owner, repo, names: others });
      return { state: 'cancelled' };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      translateGithubError(e);
    }
  }

  /** Until the adoption is merged, no request is launched (ada.json not on main yet). */
  async checkAdoptionFinished(token: string, repository: string): Promise<void> {
    const { owner, repo } = parseIdentifier(repository, this.config.GITHUB_OWNER);
    const gh = this.github.client(token);
    let topics: string[] = [];
    try {
      ({ data: { topics = [] } } = await gh.repos.get({ owner, repo }));
    } catch (e) {
      translateGithubError(e);
    }
    if (topics.includes(this.config.WORKSHOP_TOPIC) || !topics.includes(ADOPTION_TOPIC)) return;
    try {
      await gh.repos.getContent({ owner, repo, path: 'ada.json', ref: 'main' });
    } catch (e) {
      if (status(e) !== 404) translateGithubError(e);
      throw new ConflictException('Validez d’abord la reprise du projet (bouton « Valider et fusionner la reprise ») : ADA saura alors démarrer son aperçu.');
    }
  }
}
