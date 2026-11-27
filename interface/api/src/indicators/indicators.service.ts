import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { translateGithubError } from '../github/errors.js';
import { GithubService } from '../github/github.service.js';
import { ProjectsService, type Project } from '../projects/projects.service.js';
import { RegistryService } from './registry.service.js';
import { summary, projectState, type ProjectsSummary } from './registry.js';
import { STATUSES, typeFrom } from '../stories/story.js';
import { EQUIVALENTS, G_CO2_PER_KWH, MODEL_ASSUMPTIONS, type Footprint } from '../footprint/footprint.js';
import { readFootprints, sumUp } from '../footprint/footprint-log.js';
import { computeIndicators, readHistory, type MeasuredWorkRequest, type Indicators } from './indicators.js';

type GithubIssue = {
  number: number;
  state: string;
  closed_at?: string | null;
  body?: string | null;
  pull_request?: unknown;
  labels: (string | { name?: string })[];
};

/** Indicators computed from GitHub (no database); cached 5 minutes per user. */
@Injectable()
export class IndicatorsService {
  private readonly cache = new Map<string, { at: number; indicators: Indicators }>();

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly projects: ProjectsService,
    private readonly registry: RegistryService,
  ) {}

  /**
   * Every project that went through ADA (registry) that this PO can see: those of the organization and of
   * their account. Their state comes from GitHub; a repository not found counts as deleted.
   */
  private async history(gh: ReturnType<GithubService['client']>, login: string, currentProjects: Project[]): Promise<ProjectsSummary> {
    for (const project of currentProjects) await this.registry.record(project.id, project.adopted ? 'adopted' : 'unknown', null);
    const accounts = [this.config.GITHUB_OWNER.toLowerCase(), login.toLowerCase()];
    const visible = (await this.registry.read()).filter((entry) => accounts.includes(entry.owner.toLowerCase()));
    const states = await Promise.all(
      visible.map(async (entry) => {
        const repository = await gh.repos
          .get({ owner: entry.owner, repo: entry.repo })
          .then(({ data }) => data)
          .catch((e: unknown) => {
            if ((e as { status?: number }).status === 404) return null;
            throw e;
          });
        return { origin: entry.origin, state: projectState(repository, this.config.WORKSHOP_TOPIC) };
      }),
    );
    return summary(states);
  }

  /**
   * Estimated carbon footprint of ADA's usage on the projects this PO sees (current ones), in total and
   * per project, with the method, the assumptions and the sources to explain it.
   */
  async footprint(token: string, login: string): Promise<{
    total: Footprint;
    byProject: { project: string; footprint: Footprint }[];
    since: string | null;
    equivalents: typeof EQUIVALENTS;
    assumptions: { electricityGramsCo2PerKwh: number; models: typeof MODEL_ASSUMPTIONS };
  }> {
    const visible = new Set((await this.projects.list(token, login)).map((project) => project.id));
    const entries = (await readFootprints(this.config.REGISTRY_DIR)).filter((entry) => visible.has(entry.project));
    const projects = [...new Set(entries.map((entry) => entry.project))];
    return {
      total: sumUp(entries),
      byProject: projects
        .map((project) => ({ project, footprint: sumUp(entries.filter((entry) => entry.project === project)) }))
        .sort((a, b) => b.footprint.co2Grams.max - a.footprint.co2Grams.max),
      since: entries[0]?.at ?? null,
      equivalents: EQUIVALENTS,
      assumptions: { electricityGramsCo2PerKwh: G_CO2_PER_KWH, models: MODEL_ASSUMPTIONS },
    };
  }

  async compute(token: string, login: string): Promise<Indicators> {
    const cached = this.cache.get(login);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.indicators;
    const gh = this.github.client(token);
    try {
      const projects = await this.projects.list(token, login);
      const measurements = await Promise.all(
        projects.map(async (project) => {
          const issues = (await gh.paginate(gh.issues.listForRepo, { owner: project.owner, repo: project.name, state: 'all', per_page: 100 })) as GithubIssue[];
          const workRequests = issues.filter((issue) => !issue.pull_request && typeFrom(issue.labels.map((label) => (typeof label === 'string' ? label : (label.name ?? ''))), issue.body ?? ''));
          const measured: MeasuredWorkRequest[] = await Promise.all(
            workRequests.map(async (issue) => {
              const events = await gh.paginate(gh.issues.listEvents, { owner: project.owner, repo: project.name, issue_number: issue.number, per_page: 100 });
              return {
                delivered: issue.state === 'closed',
                closedAt: issue.closed_at ?? null,
                ...readHistory(events as Parameters<typeof readHistory>[0], STATUSES['in-progress']),
              };
            }),
          );
          return { name: project.name, workRequests: measured };
        }),
      );
      const indicators = computeIndicators(measurements, await this.history(gh, login, projects));
      this.cache.set(login, { at: Date.now(), indicators });
      return indicators;
    } catch (e) {
      translateGithubError(e);
    }
  }
}
