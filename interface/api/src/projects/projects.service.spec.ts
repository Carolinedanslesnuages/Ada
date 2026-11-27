import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DEFAULT_ADA } from '../ada/ada-config.js';
import { readConfig } from '../config.js';
import type { PreviewService } from '../preview/preview.service.js';
import type { GithubService } from '../github/github.service.js';
import { ProjectsService } from './projects.service.js';

const root = mkdtempSync(join(tmpdir(), 'ada-test-projets-'));
const catalogFolder = join(root, 'catalogue');
const skillsFolder = join(root, 'skills-po');
/** What the test skill adds to every created project: the common folder and the Claude Code link. */
const SHIPPED_SKILLS = ['.agents/skills/po-bug/SKILL.md', '.agents/skills/po-bug/references/methode.md', '.claude/skills/po-bug'];

const variables = {
  GITHUB_OWNER: 'proprio',
  GITHUB_CLIENT_ID: 'Iv',
  GITHUB_CLIENT_SECRET: 's',
  SESSION_SECRET: 'x'.repeat(32),
};
/** Previews folder of the tests: never ADA's (a PO's protection choice is written there). */
const previewsFolder = mkdtempSync(join(tmpdir(), 'apercus-projets-'));
const config = readConfig({ ...variables, CATALOG: catalogFolder, PO_SKILLS: skillsFolder, PREVIEWS_DIR: previewsFolder });

const repository = (name: string, topics: string[], updated_at = '2026-11-16T10:00:00Z', owner = 'proprio') => ({
  name,
  owner: { login: owner },
  default_branch: 'main',
  topics,
  updated_at,
  description: null,
  private: true,
  html_url: `https://github.com/${owner}/${name}`,
});

const git = (folder: string, ...args: string[]) =>
  execFileSync('git', [...(folder.endsWith('.git') ? ['--git-dir', folder] : ['-C', folder]), ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

const write = (file: string, content: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

/** Test catalog: two shipped templates, in a git repository (like ADA's). */
const prepareCatalog = () => {
  rmSync(root, { recursive: true, force: true });
  write(join(catalogFolder, '.gitignore'), 'node_modules/\n');
  // Common base: copied before the template, which can replace one of its files.
  write(join(catalogFolder, 'socle', 'CLAUDE.md'), '@AGENTS.md');
  write(join(catalogFolder, 'socle', 'version.txt'), 'version du socle');
  write(join(catalogFolder, 'vue-nest-dsfr', 'version.txt'), 'version du modèle');
  write(join(catalogFolder, 'vue-nest-dsfr', 'ada.json'), JSON.stringify({ ...DEFAULT_ADA, customize: ['PROJET.md'] }));
  write(join(catalogFolder, 'vue-nest-dsfr', 'PROJET.md'), '# __NOM_PROJET__\n__OBJECTIF__');
  write(join(catalogFolder, 'vue-nest-dsfr', 'front', 'src', 'App.vue'), 'sans marqueur __NOM_PROJET__');
  write(join(catalogFolder, 'vue-nest-dsfr', 'node_modules', 'lourd.js'), 'à ne pas copier');
  write(
    join(catalogFolder, 'maquette', 'ada.json'),
    JSON.stringify({ type: 'mockup', customize: ['index.html'], requiredChecks: ['Maquette (tests)'], checks: ['npm test'], preview: { npm: ['.'], main: 'npx vite' } }),
  );
  write(join(catalogFolder, 'maquette', 'index.html'), '<title>__NOM_PROJET__</title>');
  write(
    join(catalogFolder, 'vue-node', 'ada.json'),
    JSON.stringify({ ...DEFAULT_ADA, customize: ['charts/app/Chart.yaml'], deployment: { chart: 'charts/app' } }),
  );
  write(join(catalogFolder, 'vue-node', 'Dockerfile'), 'FROM node:24');
  write(join(catalogFolder, 'vue-node', 'charts', 'app', 'Chart.yaml'), 'name: __SLUG__');
  write(join(catalogFolder, 'vue-node', 'charts', 'app', 'templates', 'deployment.yaml'), 'kind: Deployment');
  git(catalogFolder, 'init', '--quiet');
  write(join(skillsFolder, 'po-bug', 'SKILL.md'), '---\nname: po-bug\n---\n');
  write(join(skillsFolder, 'po-bug', 'references', 'methode.md'), 'méthode');
};

/** “GitHub” repository of the project: a local bare repository, empty as after creation. */
const remoteRepository = () => {
  const bare = join(root, 'distant.git');
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', bare]);
  return bare;
};

const pushedFiles = (bare: string) => git(bare, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n');
const readPushed = (bare: string, file: string) => git(bare, 'show', `main:${file}`);

describe('ProjectsService', () => {
  const gh = {
    paginate: vi.fn(),
    request: vi.fn(),
    repos: {
      listForAuthenticatedUser: vi.fn(),
      listForOrg: vi.fn(),
      get: vi.fn(),
      createForAuthenticatedUser: vi.fn(),
      createInOrg: vi.fn(),
      getContent: vi.fn(),
      replaceAllTopics: vi.fn(),
      update: vi.fn(),
    },
    issues: { createLabel: vi.fn(), create: vi.fn(), createComment: vi.fn() },
    pulls: { list: vi.fn() },
  };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  const preview = { gitEnvironment: () => ({ ...process.env }) } as unknown as PreviewService;
  let service: ProjectsService;
  let remote: string;

  const validProject = { name: "L'annuaire", objective: 'Trouver un collègue et son bureau', template: 'vue-nest-dsfr' };

  const prepareCreation = () => {
    gh.repos.get.mockRejectedValue({ status: 404 });
    gh.repos.createForAuthenticatedUser.mockResolvedValue({ data: repository('l-annuaire', []) });
    gh.repos.createInOrg.mockResolvedValue({ data: repository('l-annuaire', []) });
    gh.request.mockResolvedValue({ data: [] });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prepareCatalog();
    remote = remoteRepository();
    service = new ProjectsService(config, github, preview);
    service.repositoryUrl = () => remote;
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('lists the ADA projects and those created before the renaming (atelier-po topic), without using search', async () => {
    gh.paginate.mockResolvedValue([
      repository('ancien', ['atelier-po'], '2026-01-01T00:00:00Z'),
      repository('autre', ['perso']),
      repository('en-creation', ['ada-creation']),
      repository('recent', ['ada'], '2026-11-16T00:00:00Z'),
    ]);
    const projects = await service.list('token', 'Proprio');
    expect(gh.paginate).toHaveBeenCalledWith(gh.repos.listForAuthenticatedUser, expect.objectContaining({ affiliation: 'owner' }));
    expect(projects.map((p) => p.name)).toEqual(['recent', 'ancien']);
  });

  it('lists the repositories of the organization when the owner is not the PO', async () => {
    gh.paginate.mockResolvedValue([]);
    await service.list('token', 'un-po');
    expect(gh.paginate).toHaveBeenCalledWith(gh.repos.listForOrg, expect.objectContaining({ org: 'proprio' }));
  });

  it('also lists the projects of the PO\'s personal account, with an “account~name” identifier (#37)', async () => {
    gh.paginate.mockImplementation(async (method: unknown) =>
      method === gh.repos.listForOrg ? [repository('commun', ['ada'])] : [repository('Perso', ['ada'], '2026-11-17T00:00:00Z', 'Un-PO')],
    );
    const projects = await service.list('token', 'un-po');
    expect(projects).toEqual([
      expect.objectContaining({ id: 'un-po~perso', name: 'Perso', owner: 'Un-PO', account: 'personal' }),
      expect.objectContaining({ id: 'commun', name: 'commun', owner: 'proprio', account: 'organization' }),
    ]);
  });

  it('an adoption is visible as soon as it is launched (PR to approve), then becomes an ADA project once merged', async () => {
    gh.paginate.mockResolvedValue([repository('adopted', ['vue', 'ada-reprise']), repository('pending', ['ada-reprise'])]);
    gh.repos.getContent.mockImplementation(async ({ repo }: { repo: string }) => {
      if (repo === 'adopted') return { data: { content: '' } };
      throw Object.assign(new Error('absent'), { status: 404 });
    });
    gh.repos.replaceAllTopics.mockResolvedValue({});
    gh.pulls.list.mockResolvedValue({ data: [{ html_url: 'https://github.com/proprio/en-attente/pull/2' }] });
    const projects = await service.list('token', 'proprio');
    expect(projects).toEqual([
      expect.objectContaining({ id: 'adopted', adoption: null, adopted: true }),
      expect.objectContaining({ id: 'pending', adoption: { pullRequest: 'https://github.com/proprio/en-attente/pull/2' } }),
    ]);
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith({ owner: 'proprio', repo: 'adopted', names: ['vue', 'ada-reprise', 'ada'] });
  });

  it('refuses an invalid project without creating anything', async () => {
    await expect(service.create('token', 'po', { name: 'x', objective: '', template: '' })).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('offers only the templates shipped in ADA\'s catalog, without a GitHub template repository', () => {
    const { families, types, templates } = service.templates();
    expect(types.map((t) => t.id)).toEqual(expect.arrayContaining(['service', 'form', 'extension', 'api', 'mockup']));
    for (const type of types) expect(families.map((f) => f.id)).toContain(type.family);
    for (const template of templates) expect(types.map((t) => t.id)).toContain(template.type);
    for (const type of types) expect(templates.some((m) => m.type === type.id)).toBe(true);
    expect(templates.filter((m) => m.available).map((m) => m.id)).toEqual(['vue-nest-dsfr', 'vue-node', 'maquette']);
    expect(templates.filter((m) => m.deployable).map((m) => m.id)).toEqual(['vue-node']);
    expect(templates.find((m) => m.id === 'formulaire')).toMatchObject({ type: 'form', available: false });
    expect(gh.repos.get).not.toHaveBeenCalled();
  });

  it('finds by default the catalog at the root of ADA\'s repository', () => {
    const defaults = new ProjectsService(readConfig(variables), github, preview);
    expect(defaults.catalogFolder).toMatch(/[/\\]catalogue$/);
    expect(defaults.templates().templates.find((m) => m.id === 'vue-nest-dsfr')!.available).toBe(true);
  });

  it('refuses a project type whose template is not shipped yet', async () => {
    prepareCreation();
    await expect(service.create('token', 'po', { ...validProject, template: 'django' })).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('refuses a name already taken', async () => {
    gh.repos.get.mockResolvedValue({ data: repository('l-annuaire', []) });
    await expect(service.create('token', 'po', validProject)).rejects.toBeInstanceOf(ConflictException);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('creates an empty private repository, configures it, then pushes the customized template in a single commit', async () => {
    prepareCreation();
    const result = await service.create('token', 'proprio', validProject);

    expect(gh.repos.createForAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'l-annuaire', private: true, auto_init: false }),
    );
    expect(pushedFiles(remote)).toEqual([...SHIPPED_SKILLS, 'CLAUDE.md', 'PROJET.md', 'ada.json', 'front/src/App.vue', 'version.txt']);
    expect(readPushed(remote, 'CLAUDE.md')).toBe('@AGENTS.md');
    expect(readPushed(remote, 'version.txt')).toBe('version du modèle');
    expect(readPushed(remote, 'PROJET.md')).toBe('# L’annuaire\nTrouver un collègue et son bureau.');
    // ADA's po- skills are shipped with the project: common folder, and relative link for Claude Code.
    expect(readPushed(remote, '.agents/skills/po-bug/references/methode.md')).toBe('méthode');
    expect(git(remote, 'ls-tree', 'main', '.claude/skills/po-bug')).toMatch(/^120000 blob /);
    expect(readPushed(remote, '.claude/skills/po-bug')).toBe('../../.agents/skills/po-bug');
    expect(readPushed(remote, 'front/src/App.vue')).toBe('sans marqueur __NOM_PROJET__');
    expect(git(remote, 'log', '--format=%an|%s', 'main').trim()).toBe('proprio|chore: création du projet L’annuaire');

    expect(gh.repos.update).toHaveBeenCalledWith(
      expect.objectContaining({ repo: 'l-annuaire', allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, delete_branch_on_merge: true }),
    );
    const topics = gh.repos.replaceAllTopics.mock.calls.map((call) => (call[0] as { names: string[] }).names);
    expect(topics).toEqual([['ada-creation'], ['ada']]);
    const labels = gh.issues.createLabel.mock.calls.map((call) => (call[0] as { name: string }).name);
    expect(labels).toEqual(expect.arrayContaining(['user-story', 'bug', 'story:en-cours', 'story:besoin-dev']));
    const routes = gh.request.mock.calls.map(([route]) => String(route));
    expect(routes.indexOf('PUT /repos/{owner}/{repo}/actions/permissions/workflow')).toBeLessThan(routes.indexOf('POST /repos/{owner}/{repo}/rulesets'));
    expect(result.settings.automaticVersions.state).toBe('done');
    expect(result.settings.mainProtection.state).toBe('done');
  });

  it('the idea told at creation becomes the first free request, launched for ADA (#68)', async () => {
    prepareCreation();
    gh.issues.create.mockResolvedValue({ data: { number: 1 } });
    const idea = 'partager les trajets entre agents, le matin surtout';
    const result = await service.create('token', 'proprio', { name: "L'annuaire", template: 'vue-nest-dsfr', idea });
    expect(result.idea).toBe(1);
    expect(gh.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'proprio', repo: 'l-annuaire', title: `Demande libre : ${idea}`, labels: ['mode-libre', 'story:en-cours'] }),
    );
    expect(gh.issues.create.mock.calls[0]![0].body).toContain(idea);
    expect(gh.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 1, body: expect.stringContaining('Lancée depuis ADA') }));
    // The objective (repository description, PROJET.md) comes from the idea.
    expect(readPushed(remote, 'PROJET.md')).toContain('partager les trajets entre agents, le matin surtout.');
  });

  it('without an idea, no request is created; a failure of the idea does not undo the creation', async () => {
    prepareCreation();
    expect((await service.create('token', 'proprio', validProject)).idea).toBeNull();
    expect(gh.issues.create).not.toHaveBeenCalled();
    rmSync(remote, { recursive: true, force: true });
    remote = remoteRepository();
    gh.issues.create.mockRejectedValue({ status: 500 });
    await expect(service.create('token', 'proprio', { ...validProject, name: 'Autre projet', idea: 'une idée assez longue' })).resolves.toMatchObject({ idea: null });
  });

  it('creates a private repository by default, public if the PO chooses so', async () => {
    prepareCreation();
    await service.create('token', 'proprio', validProject);
    expect(gh.repos.createForAuthenticatedUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'l-annuaire', private: true }));
    vi.clearAllMocks();
    prepareCreation();
    rmSync(remote, { recursive: true, force: true });
    remote = remoteRepository();
    await service.create('token', 'proprio', { ...validProject, visibility: 'public' });
    expect(gh.repos.createForAuthenticatedUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'l-annuaire', private: false }));
  });

  it('refuses an unknown visibility', async () => {
    prepareCreation();
    await expect(service.create('token', 'proprio', { ...validProject, visibility: 'interne' })).rejects.toThrow(BadRequestException);
  });

  it('creates the repository on the signed-in person\'s account, never on the one that configured ADA', async () => {
    prepareCreation();
    gh.repos.createForAuthenticatedUser.mockResolvedValue({ data: repository('l-annuaire', [], undefined, 'un-po') });
    const { project } = await service.create('token', 'un-po', validProject);
    expect(gh.repos.get).toHaveBeenCalledWith({ owner: 'un-po', repo: 'l-annuaire' });
    expect(gh.repos.createForAuthenticatedUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'l-annuaire' }));
    expect(gh.repos.createInOrg).not.toHaveBeenCalled();
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith(expect.objectContaining({ owner: 'un-po', repo: 'l-annuaire' }));
    // “account~name” identifier: the project is on the PO's personal account.
    expect(project.id).toBe('un-po~l-annuaire');
  });

  it('explains to the PO that the App cannot create a repository (403 from GitHub)', async () => {
    prepareCreation();
    gh.repos.createForAuthenticatedUser.mockRejectedValue({ status: 403, request: { method: 'POST', url: 'x' } });
    await expect(service.create('token', 'proprio', validProject)).rejects.toThrow(/Installez-la sur votre compte GitHub/);
  });

  it('tolerates a label already present in the repository (“bug” exists by default)', async () => {
    prepareCreation();
    gh.issues.createLabel.mockImplementation(async ({ name }: { name: string }) => {
      if (name === 'bug') throw { status: 422 };
    });
    await expect(service.create('token', 'proprio', validProject)).resolves.toBeDefined();
  });

  it('resumes a creation interrupted after the push without pushing again or doubling the protection', async () => {
    prepareCreation();
    await service.create('token', 'proprio', validProject);
    vi.clearAllMocks();
    gh.repos.get.mockResolvedValue({ data: repository('l-annuaire', ['ada-creation']) });
    gh.request.mockImplementation(async (route: string) => (route.startsWith('GET') ? { data: [{ name: 'main protégée' }] } : {}));

    const result = await service.create('token', 'proprio', validProject);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
    expect(git(remote, 'rev-list', '--count', 'main').trim()).toBe('1');
    expect(gh.request.mock.calls.some(([route]) => route === 'POST /repos/{owner}/{repo}/rulesets')).toBe(false);
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith(expect.objectContaining({ names: ['ada'] }));
    expect(result.settings.mainProtection.state).toBe('done');
  });

  it('resumes a creation started with the old method (repository generated from a template repository)', async () => {
    prepareCreation();
    const previous = join(root, 'ancien');
    git(root, 'clone', '--quiet', remote, previous);
    write(join(previous, 'PROJET.md'), '# __NOM_PROJET__');
    write(join(previous, 'obsolete.txt'), 'fichier de l’ancien modèle');
    git(previous, 'add', '-A');
    git(previous, 'commit', '--quiet', '-m', 'Initial commit');
    git(previous, 'push', '--quiet', 'origin', 'HEAD:main');
    gh.repos.get.mockResolvedValue({ data: { ...repository('l-annuaire', []), template_repository: { name: 'modele-vue-nest-dsfr' } } });

    await service.create('token', 'proprio', validProject);
    expect(pushedFiles(remote)).toEqual([...SHIPPED_SKILLS, 'CLAUDE.md', 'PROJET.md', 'ada.json', 'front/src/App.vue', 'version.txt']);
    expect(readPushed(remote, 'CLAUDE.md')).toBe('@AGENTS.md');
    expect(readPushed(remote, 'version.txt')).toBe('version du modèle');
    expect(git(remote, 'rev-list', '--count', 'main').trim()).toBe('2');
  });

  it('always refuses an existing repository that is not an ADA creation in progress', async () => {
    gh.repos.get.mockResolvedValue({ data: { ...repository('l-annuaire', ['ada']), template_repository: { name: 'modele-vue-nest-dsfr' } } });
    await expect(service.create('token', 'proprio', validProject)).rejects.toBeInstanceOf(ConflictException);
    gh.repos.get.mockResolvedValue({ data: { ...repository('l-annuaire', []), template_repository: null } });
    await expect(service.create('token', 'proprio', validProject)).rejects.toBeInstanceOf(ConflictException);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('creates the project even if GitHub refuses the merge setting', async () => {
    prepareCreation();
    gh.repos.update.mockRejectedValueOnce({ status: 403 });
    await expect(service.create('token', 'proprio', validProject)).resolves.toBeDefined();
  });

  it('customizes and protects main according to the template\'s ada.json', async () => {
    prepareCreation();
    await service.create('token', 'proprio', { ...validProject, template: 'maquette' });
    expect(readPushed(remote, 'index.html')).toBe('<title>L’annuaire</title>');
    const rules = gh.request.mock.calls.find(([route]) => route === 'POST /repos/{owner}/{repo}/rulesets')![1] as { rules: { type: string; parameters?: { required_status_checks?: { context: string }[] } }[] };
    expect(rules.rules.find((r) => r.type === 'required_status_checks')!.parameters!.required_status_checks).toEqual([{ context: 'Maquette (tests)' }]);
  });

  it('reports to the PO the settings GitHub refuses (free account, organization)', async () => {
    prepareCreation();
    gh.request.mockRejectedValue({ status: 403 });
    const result = await service.create('token', 'proprio', validProject);
    expect(result.settings).toEqual({
      automaticVersions: { state: 'to-do', link: 'https://github.com/proprio/l-annuaire/settings/actions' },
      mainProtection: { state: 'to-do', link: 'https://github.com/proprio/l-annuaire/settings/rules' },
    });
  });

  it('leaves no working copy behind', async () => {
    prepareCreation();
    const before = readFileSync(join(catalogFolder, 'vue-nest-dsfr', 'PROJET.md'), 'utf8');
    await service.create('token', 'proprio', validProject);
    expect(readFileSync(join(catalogFolder, 'vue-nest-dsfr', 'PROJET.md'), 'utf8')).toBe(before);
  });

  it('adds the deployment chart only if the PO plans to deploy the project', async () => {
    prepareCreation();
    await service.create('token', 'proprio', { ...validProject, template: 'vue-node' });
    expect(pushedFiles(remote)).toEqual([...SHIPPED_SKILLS, 'CLAUDE.md', 'Dockerfile', 'ada.json', 'version.txt']);
  });

  it('deployed project: Helm chart added and customized', async () => {
    prepareCreation();
    await service.create('token', 'proprio', { ...validProject, template: 'vue-node', deployed: true });
    expect(pushedFiles(remote)).toEqual([...SHIPPED_SKILLS, 'CLAUDE.md', 'Dockerfile', 'ada.json', 'charts/app/Chart.yaml', 'charts/app/templates/deployment.yaml', 'version.txt']);
    expect(readPushed(remote, 'charts/app/Chart.yaml')).toBe('name: l-annuaire');
  });

  describe('protection of the main branch, checked when a project is opened', () => {
    const CHECKS = ['Anti-fuite (gitleaks)', 'Application mobile (lint, types, tests dont accessibilité, compilation)'];
    const adaJson = Buffer.from(JSON.stringify({ type: 'mobile', requiredChecks: CHECKS, checks: ['npm test'], preview: { main: 'npx vite' } })).toString('base64');
    /** Simulated GitHub: rules in force on main, answer to the rule creation. */
    function github(options: { rules?: unknown[]; isPrivate?: boolean; topics?: string[]; refusal?: { status: number; message: string } } = {}) {
      gh.repos.get.mockResolvedValue({ data: { default_branch: 'main', private: options.isPrivate ?? false, topics: options.topics ?? ['ada'] } });
      gh.repos.getContent.mockResolvedValue({ data: { content: adaJson } });
      gh.request.mockImplementation(async (route: string) => {
        if (route === 'GET /repos/{owner}/{repo}/rules/branches/{branch}') return { data: options.rules ?? [] };
        if (route === 'GET /repos/{owner}/{repo}/rulesets') return { data: [] };
        if (route === 'POST /repos/{owner}/{repo}/rulesets') {
          if (options.refusal) throw Object.assign(new Error(options.refusal.message), { status: options.refusal.status, request: { method: 'POST', url: route } });
          return { data: { id: 1 } };
        }
        return { data: [] };
      });
    }
    const applied = () => gh.request.mock.calls.filter(([route]) => route === 'POST /repos/{owner}/{repo}/rulesets');

    it('applies the missing rule (PR and ada.json checks required), only once', async () => {
      github();
      expect(await service.ensureProtection('token', 'gladys')).toMatchObject({ state: 'applied', reason: null });
      expect(applied()).toHaveLength(1);
      const body = applied()[0]![1] as { rules: { type: string; parameters?: { required_status_checks?: { context: string }[] } }[] };
      expect(body.rules.map((rule) => rule.type)).toEqual(['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']);
      expect(body.rules[3]!.parameters!.required_status_checks!.map((check) => check.context)).toEqual(CHECKS);
      await service.ensureProtection('token', 'gladys'); // reopened at once: GitHub is not asked again
      expect(applied()).toHaveLength(1);
    });

    it('applies nothing when a rule already requires a PR on main', async () => {
      github({ rules: [{ type: 'pull_request' }, { type: 'deletion' }] });
      expect((await service.ensureProtection('token', 'gladys')).state).toBe('protected');
      expect(applied()).toHaveLength(0);
    });

    it('adopted project without a rule: ADA offers to protect the branch, applying nothing by itself', async () => {
      github({ topics: ['ada', 'ada-reprise'] });
      expect((await service.ensureProtection('token', 'secret-santa')).state).toBe('to-propose');
      expect(applied()).toHaveLength(0);
    });

    it('adopted project already protected by a rule of its team: nothing to propose', async () => {
      github({ topics: ['ada', 'ada-reprise'], rules: [{ type: 'pull_request' }] });
      expect((await service.ensureProtection('token', 'secret-santa')).state).toBe('protected');
      expect(applied()).toHaveLength(0);
    });

    it('the PO accepts: ADA applies the rule, with the checks of ada.json', async () => {
      github({ topics: ['ada', 'ada-reprise'] });
      expect((await service.ensureProtection('token', 'secret-santa')).state).toBe('to-propose');
      expect(await service.protectOnDemand('token', 'secret-santa', 'po1')).toMatchObject({ state: 'applied' });
      expect(applied()).toHaveLength(1);
      const body = applied()[0]![1] as { rules: { type: string; parameters?: { required_status_checks?: { context: string }[] } }[] };
      expect(body.rules.find((rule) => rule.type === 'required_status_checks')!.parameters!.required_status_checks!.map((check) => check.context)).toEqual(CHECKS);
      expect((await service.ensureProtection('token', 'secret-santa')).state).toBe('applied'); // the screen updates at once
    });

    it('the PO refuses: ADA remembers it (even after a restart) and does not ask again', async () => {
      github({ topics: ['ada', 'ada-reprise'] });
      expect(await service.refuseProtection('secret-santa', 'po1')).toMatchObject({ state: 'refused' });
      const afterRestart = new ProjectsService(config, { client: () => gh } as unknown as GithubService, preview);
      expect((await afterRestart.ensureProtection('token', 'secret-santa')).state).toBe('refused');
      expect(applied()).toHaveLength(0);
    });

    it('the PO goes back on the refusal and accepts: the rule is applied and the refusal forgotten', async () => {
      github({ topics: ['ada', 'ada-reprise'] });
      await service.refuseProtection('secret-santa', 'po1');
      expect((await service.protectOnDemand('token', 'secret-santa', 'po1')).state).toBe('applied');
      github({ topics: ['ada', 'ada-reprise'] }); // the rule is not visible yet: the refusal must not come back
      expect((await new ProjectsService(config, { client: () => gh } as unknown as GithubService, preview).ensureProtection('token', 'secret-santa')).state).toBe('to-propose');
    });

    it('the PO accepts but GitHub refuses: the reason is given, the choice stays open', async () => {
      github({ topics: ['ada', 'ada-reprise'], isPrivate: true, refusal: { status: 403, message: 'Upgrade to GitHub Pro' } });
      expect(await service.protectOnDemand('token', 'secret-santa', 'po1')).toMatchObject({ state: 'impossible', reason: expect.stringContaining('dépôt privé') });
    });

    it('private repository on a free account: says so clearly to the PO, and does not retry at every opening', async () => {
      github({ isPrivate: true, refusal: { status: 403, message: 'Upgrade to GitHub Pro or make this repository public to enable this feature.' } });
      expect(await service.ensureProtection('token', 'signalements')).toMatchObject({
        state: 'impossible',
        reason: 'GitHub ne permet pas de protéger un dépôt privé sur un compte personnel gratuit.',
        link: 'https://github.com/proprio/signalements/rules',
      });
      await service.ensureProtection('token', 'signalements');
      expect(applied()).toHaveLength(1);
    });

    it('other refusal: gives GitHub\'s exact reason (so that it can be fixed)', async () => {
      github({ refusal: { status: 422, message: 'Invalid rule \'pull_request\': unknown parameter' } });
      expect((await service.ensureProtection('token', 'gladys')).reason).toBe("GitHub a refusé la règle (422) : Invalid rule 'pull_request': unknown parameter.");
    });

    it('reads the checks required by GitHub\'s rule; none: null', async () => {
      github({ rules: [{ type: 'pull_request' }, { type: 'required_status_checks', parameters: { required_status_checks: CHECKS.map((context) => ({ context })) } }] });
      expect(await service.enforcedChecks(gh as never, 'proprio', 'gladys', 'main')).toEqual(CHECKS);
      github({ rules: [{ type: 'pull_request' }] });
      expect(await service.enforcedChecks(gh as never, 'proprio', 'gladys', 'main')).toBeNull();
    });
  });
});
