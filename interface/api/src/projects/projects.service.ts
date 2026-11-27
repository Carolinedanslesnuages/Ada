import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Octokit } from '@octokit/rest';
import { PreviewService, type Runner } from '../preview/preview.service.js';
import { CONFIG, type Config } from '../config.js';
import { describeGithubError, translateGithubError } from '../github/errors.js';
import { GithubService } from '../github/github.service.js';
import { readAdaConfig, type AdaConfig } from '../ada/ada-config.js';
import { catalog, FAMILIES, TYPES, type Template } from './templates.js';
import { validateProject } from './project.js';
import { createEmptyRepository, saveIdea, pushTemplate } from './repository-creation.js';
import { projectIdentifier } from './repository.js';
import { MainProtection, type Protection } from './main-protection.js';
import { allowReleasePlease, enforceSquash, applyLabels } from './repository-settings.js';
import { adoptionPullRequest, ADOPTION_TOPIC } from './adoption.js';

export { ADOPTION_TOPIC } from './adoption.js';
export type { ProtectionState, Protection } from './main-protection.js';

export interface Project {
  /** Identifier in ADA: “name”, or “account~name” outside the organization (see repository.ts). */
  id: string;
  name: string;
  owner: string;
  /** Repository of ADA's organization, or of the PO's personal account. */
  account: 'organization' | 'personal';
  /** Adoption not approved yet (#37): analysis in progress, or adoption PR to merge. */
  adoption: { pullRequest: string | null } | null;
  /** Adopted project (not created by ADA): it can be unlinked, without deleting anything. */
  adopted: boolean;
  description: string | null;
  isPrivate: boolean;
  url: string;
  updatedAt: string | null;
}

/** GitHub setting done automatically, or to be done by the PO (with the link to do it). */
export interface Setting {
  state: 'done' | 'to-do';
  link: string;
}

export interface CreationResult {
  project: Project;
  settings: { automaticVersions: Setting; mainProtection: Setting };
  /** Number of the request created from the PO's idea (the assistant takes it up); null without an idea. */
  idea: number | null;
}

export type GithubRepository = {
  name: string;
  owner: { login: string };
  default_branch?: string;
  archived?: boolean;
  permissions?: { admin?: boolean; push?: boolean };
  description: string | null;
  private: boolean;
  html_url: string;
  updated_at?: string | null;
  topics?: string[];
};

export const toProject = (d: GithubRepository, defaultOwner: string): Project => ({
  id: projectIdentifier(d.owner.login, d.name, defaultOwner),
  name: d.name,
  owner: d.owner.login,
  account: d.owner.login.toLowerCase() === defaultOwner.toLowerCase() ? 'organization' : 'personal',
  adoption: null,
  adopted: (d.topics ?? []).includes(ADOPTION_TOPIC),
  description: d.description,
  isPrivate: d.private,
  url: d.html_url,
  updatedAt: d.updated_at ?? null,
});

/** Topic set during the creation: lets an interrupted creation be resumed. */
const CREATION_TOPIC = 'ada-creation';
const execFileAsync = promisify(execFile);
const defaultRun: Runner = (command, args, options) =>
  execFileAsync(command, args, { ...options, maxBuffer: 10 * 1024 * 1024 });
const status = (e: unknown) => (e as { status?: number }).status;


@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  run: Runner = defaultRun;

  private readonly protection: MainProtection;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly preview: PreviewService,
  ) {
    this.protection = new MainProtection(config, github, (gh, owner, repo, ref) => this.readRepositoryConfig(gh, owner, repo, ref), this.logger);
  }

  /** Topic of the projects, plus the former name of the tool (projects created before the switch to ADA). */
  private get topics(): string[] {
    return [this.config.WORKSHOP_TOPIC, 'atelier-po'];
  }

  private get owner(): string {
    return this.config.GITHUB_OWNER;
  }

  /** ADA's `catalogue/` folder: one subfolder per template (same path from src/ and dist/). */
  get catalogFolder(): string {
    return this.config.CATALOG
      ? resolve(this.config.CATALOG)
      : resolve(import.meta.dirname, '..', '..', '..', '..', 'catalogue');
  }

  /** Base common to every template (`catalogue/socle/`): copied before the template, which completes it. */
  get baseFolder(): string {
    return join(this.catalogFolder, 'socle');
  }

  /** ADA's `skills/po/` folder: the skills shipped in every created project. */
  get poSkillsFolder(): string {
    return this.config.PO_SKILLS
      ? resolve(this.config.PO_SKILLS)
      : resolve(import.meta.dirname, '..', '..', '..', '..', 'skills', 'po');
  }

  /** Catalog: a template is offered only if its folder is shipped with its ada.json. */
  templates(): { families: typeof FAMILIES; types: typeof TYPES; templates: Template[] } {
    const templates = catalog().map((template) => {
      const config = this.catalogConfig(template.id);
      return { ...template, available: config !== null, deployable: Boolean(config?.deployment) };
    });
    return { families: FAMILIES, types: TYPES, templates };
  }

  /** ada.json of a catalog template; null if the template is not shipped (or unreadable). */
  catalogConfig(id: string): AdaConfig | null {
    const filePath = join(this.catalogFolder, id, 'ada.json');
    if (!existsSync(filePath)) return null;
    try {
      return readAdaConfig(readFileSync(filePath, 'utf8'));
    } catch (e) {
      this.logger.warn(`Template ${id} discarded: ${(e as Error).message}`);
      return null;
    }
  }

  /** ada.json of a repository (on GitHub); missing → Vue + NestJS behaviour. */
  async readRepositoryConfig(gh: Octokit, owner: string, repo: string, ref?: string): Promise<AdaConfig> {
    try {
      const { data } = await gh.repos.getContent({ owner, repo, path: 'ada.json', ...(ref ? { ref } : {}) });
      if (Array.isArray(data) || !('content' in data)) return readAdaConfig(null);
      return readAdaConfig(Buffer.from(data.content, 'base64').toString('utf8'));
    } catch (e) {
      if (status(e) === 404) return readAdaConfig(null);
      throw e;
    }
  }

  /**
   * Repositories the PO can see in ADA's organization and in their personal account (direct
   * read, not GitHub search, whose index takes several minutes to see a new repository).
   * The application token only sees the repositories where it is installed.
   */
  async accessibleRepositories(gh: Octokit, login: string): Promise<GithubRepository[]> {
    const personal = (await gh.paginate(gh.repos.listForAuthenticatedUser, { affiliation: 'owner', per_page: 100 })) as GithubRepository[];
    if (this.owner.toLowerCase() === login.toLowerCase()) return personal;
    const organization = (await gh.paginate(gh.repos.listForOrg, { org: this.owner, per_page: 100 })) as GithubRepository[];
    return [...organization, ...personal];
  }

  hasTopic(repository: GithubRepository, ...topics: string[]): boolean {
    return (repository.topics ?? []).some((topic) => topics.includes(topic));
  }

  /**
   * ADA's projects: repositories bearing the workshop topic, and adoptions (#37). An adoption is
   * visible as soon as it is launched, to follow the analysis and approve the PR; once its PR is merged
   * (ada.json on main), it gets the final topic and becomes a project like the others.
   */
  async list(token: string, login: string): Promise<Project[]> {
    const gh = this.github.client(token);
    try {
      const repositories = await this.accessibleRepositories(gh, login);
      const adoptions = await Promise.all(
        repositories
          .filter((d) => !this.hasTopic(d, ...this.topics) && this.hasTopic(d, ADOPTION_TOPIC))
          .map(async (d) => {
            const project = toProject(d, this.owner);
            if (await this.mergedAdoption(gh, d)) return project;
            return { ...project, adoption: { pullRequest: await adoptionPullRequest(gh, d.owner.login, d.name) } };
          }),
      );
      const byDate = new Map(repositories.map((d) => [projectIdentifier(d.owner.login, d.name, this.owner), d.updated_at ?? '']));
      return [...repositories.filter((d) => this.hasTopic(d, ...this.topics)).map((d) => toProject(d, this.owner)), ...adoptions].sort((a, b) =>
        (byDate.get(b.id) ?? '').localeCompare(byDate.get(a.id) ?? ''),
      );
    } catch (e) {
      translateGithubError(e);
    }
  }

  private async mergedAdoption(gh: Octokit, repository: GithubRepository): Promise<boolean> {
    const owner = repository.owner.login;
    try {
      await gh.repos.getContent({ owner, repo: repository.name, path: 'ada.json', ref: repository.default_branch ?? 'main' });
    } catch (e) {
      if (status(e) === 404) return false;
      throw e;
    }
    // The “adoption” marking is kept: it tells an adopted project from a project created by ADA.
    const topics = [...(repository.topics ?? []), this.config.WORKSHOP_TOPIC];
    await gh.repos.replaceAllTopics({ owner, repo: repository.name, names: topics }).catch((e: unknown) => {
      this.logger.warn(`Topic of ${owner}/${repository.name} not updated: ${describeGithubError(e)}`);
    });
    return true;
  }

  /**
   * Creation of a project from `catalogue/<template>/`:
   * 1. empty private repository (provisional “ada-creation” topic, to be able to resume);
   * 2. settings before the first push (squash only, release-please allowed);
   * 3. customized copy of the template, pushed in a single commit under the PO's name;
   * 4. protection of main, final topic, labels.
   * Each step can be replayed: an interrupted creation is resumed with the same name.
   */
  async create(token: string, login: string, data: unknown): Promise<CreationResult> {
    const validation = validateProject(data);
    if (!validation.ok) throw new BadRequestException({ errors: validation.errors });
    const { project, slug } = validation;
    const template = this.templates().templates.find((m) => m.id === project.template);
    if (!template?.available) throw new BadRequestException({ errors: { template: 'Ce type de projet n’est pas encore disponible' } });
    const templateFolder = join(this.catalogFolder, template.id);
    const templateConfig = readAdaConfig(await readFile(join(templateFolder, 'ada.json'), 'utf8'));
    const gh = this.github.client(token);
    // The project belongs to the signed-in person: repository created on THEIR GitHub account (with their
    // token), never on the one that configured ADA. Older projects stay where they are.
    const owner = login;
    const description = project.objective.slice(0, 350);

    // A repository of the same name: if it is an interrupted ADA creation, it is resumed; otherwise the name is taken.
    let existing: (GithubRepository & { template_repository?: { name?: string } | null }) | null = null;
    try {
      ({ data: existing } = await gh.repos.get({ owner, repo: slug }));
    } catch (e) {
      if (status(e) !== 404) translateGithubError(e);
    }
    const adoption = existing !== null && this.interruptedCreation(existing);
    if (existing && !adoption) {
      throw new ConflictException({ errors: { name: `Un projet « ${slug} » existe déjà : choisissez un autre nom` } });
    }
    if (adoption) this.logger.log(`Resuming the interrupted creation of ${slug}`);

    let repository: GithubRepository;
    let automaticVersions: Setting['state'];
    let mainProtection: Setting['state'];
    try {
      if (existing && adoption) {
        repository = existing;
        await gh.repos.update({ owner, repo: slug, description, private: project.visibility === 'private' });
      } else {
        repository = await createEmptyRepository(gh, slug, description, project.visibility === 'private', (message) => this.logger.warn(message));
        await gh.repos.replaceAllTopics({ owner, repo: slug, names: [CREATION_TOPIC] });
      }
      // Settings BEFORE the first push: this push triggers the CI and release-please.
      await enforceSquash(gh, owner, slug, (message) => this.logger.warn(message));
      automaticVersions = await allowReleasePlease(gh, owner, slug, (message) => this.logger.warn(message));
      // Deployment chart: only if the PO plans to deploy the project.
      const excluded = templateConfig.deployment && !project.deployed ? [templateConfig.deployment.chart] : [];
      await pushTemplate({ run: this.run, env: this.preview.gitEnvironment(token), url: this.repositoryUrl(login, slug) }, login, { base: this.baseFolder, template: templateFolder }, templateConfig.customize, excluded, {
        name: project.name,
        baseline: project.baseline,
        slug,
        objective: project.objective,
        date: new Date().toISOString().slice(0, 10),
        po: login,
      }, this.poSkillsFolder);
      mainProtection = await this.protection.protect(gh, owner, slug, templateConfig.requiredChecks);
      await gh.repos.replaceAllTopics({ owner, repo: slug, names: [this.config.WORKSHOP_TOPIC] });
      await this.applyLabels(gh, owner, slug);
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      translateGithubError(e);
    }
    const idea = project.idea ? await saveIdea(gh, owner, slug, project.idea, login, (message) => this.logger.warn(message)) : null;

    const base = `https://github.com/${owner}/${slug}/settings`;
    return {
      project: toProject({ ...repository, owner: { login: owner } }, this.owner),
      settings: {
        automaticVersions: { state: automaticVersions, link: `${base}/actions` },
        mainProtection: { state: mainProtection, link: `${base}/rules` },
      },
      idea,
    };
  }


  /**
   * ADA creation left unfinished: provisional topic, or (old method) repository generated from
   * a “modele-…” template repository without ADA's topic.
   */
  private interruptedCreation(repository: GithubRepository & { template_repository?: { name?: string } | null }): boolean {
    const topics = repository.topics ?? [];
    if (topics.some((topic) => this.topics.includes(topic))) return false;
    return topics.includes(CREATION_TOPIC) || (repository.template_repository?.name ?? '').startsWith('modele-');
  }


  /** Git address of a project's repository (replaceable in tests by a local repository). */
  repositoryUrl = (owner: string, repo: string) => `https://github.com/${owner}/${repo}.git`;


  /**
   * Labels the issue forms depend on (they only set a label if it exists) and
   * the workshop statuses. A repository created from a template does not inherit its labels.
   */
  applyLabels(gh: Octokit, owner: string, repo: string): Promise<void> {
    return applyLabels(gh, owner, repo);
  }

  /** Checks GitHub really requires before merging on this branch (see MainProtection). */
  enforcedChecks(gh: Octokit, owner: string, repo: string, branch: string): Promise<string[] | null> {
    return this.protection.enforcedChecks(gh, owner, repo, branch);
  }

  /** When a project is opened: its main branch must be protected (see MainProtection). */
  ensureProtection(token: string, repository: string): Promise<Protection> {
    return this.protection.ensure(token, repository);
  }

  /** The PO accepts that ADA protects the main branch (adopted project). */
  protectOnDemand(token: string, repository: string, login: string): Promise<Protection> {
    return this.protection.applyOnDemand(token, repository, login);
  }

  /** The PO does not want to protect the branch (adopted project): ADA remembers it and does not ask again. */
  refuseProtection(repository: string, login: string): Promise<Protection> {
    return this.protection.refuse(repository, login);
  }
}
