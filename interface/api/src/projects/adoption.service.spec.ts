import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { readConfig } from '../config.js';
import type { AgentService } from '../agent/agent.service.js';
import type { GithubService } from '../github/github.service.js';
import type { StoriesService } from '../stories/stories.service.js';
import type { ProjectsService } from './projects.service.js';
import { AdoptionService, analysisRequestText } from './adoption.service.js';

const config = readConfig({ GITHUB_OWNER: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32) });
const repository = (name: string, owner: string, topics: string[] = [], extra: object = {}) => ({
  name,
  owner: { login: owner },
  topics,
  default_branch: 'main',
  archived: false,
  permissions: { push: true, admin: true },
  description: null,
  private: true,
  html_url: `https://github.com/${owner}/${name}`,
  ...extra,
});

describe('AdoptionService (#37)', () => {
  const gh = {
    repos: { get: vi.fn(), replaceAllTopics: vi.fn(), getContent: vi.fn() },
    pulls: { list: vi.fn(), get: vi.fn(), merge: vi.fn(), update: vi.fn() },
    git: { deleteRef: vi.fn() },
    issues: { createComment: vi.fn(), update: vi.fn(), listForRepo: vi.fn() },
    paginate: vi.fn(),
    checks: { listForRef: vi.fn() },
  };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  const projects = {
    accessibleRepositories: vi.fn(),
    list: vi.fn(),
    applyLabels: vi.fn(),
    hasTopic: (d: { topics?: string[] }, ...topics: string[]) => (d.topics ?? []).some((topic) => topics.includes(topic)),
    templates: () => ({ templates: [{ id: 'vue-node', label: 'Vue + Node', available: true }, { id: 'pas-pret', label: 'X', available: false }] }),
  };
  const stories = { submitPrompt: vi.fn() };
  const agent = { checkAvailable: vi.fn(), activeLock: vi.fn(), analyzeAdoption: vi.fn() };
  let service: AdoptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdoptionService(config, github, projects as unknown as ProjectsService, stories as unknown as StoriesService, agent as unknown as AgentService);
    gh.repos.get.mockResolvedValue({ data: repository('mon-poc', 'un-po', ['vue']) });
    gh.repos.replaceAllTopics.mockResolvedValue({});
    gh.pulls.list.mockResolvedValue({ data: [] });
    stories.submitPrompt.mockResolvedValue({ number: 7 });
    agent.activeLock.mockResolvedValue(null);
    agent.analyzeAdoption.mockResolvedValue(undefined);
  });

  it('lists the repositories not yet in ADA, with the state of their adoption (analysis in progress, PR to merge)', async () => {
    projects.accessibleRepositories.mockResolvedValue([
      repository('deja', 'proprio', ['ada']),
      repository('commun', 'proprio'),
      repository('archived', 'proprio', [], { archived: true }),
      repository('lecture-seule', 'proprio', [], { permissions: { push: false } }),
      repository('en-analyse', 'Un-PO', ['ada-reprise']),
      repository('mon-poc', 'Un-PO', ['ada-reprise']),
    ]);
    projects.list.mockResolvedValue([{ id: 'deja' }]);
    gh.pulls.list.mockImplementation(async ({ repo }: { repo: string }) => ({ data: repo === 'mon-poc' ? [{ html_url: 'https://github.com/Un-PO/mon-poc/pull/3' }] : [] }));
    agent.activeLock.mockImplementation(async (id: string) => (id === 'un-po~en-analyse' ? { pid: 1 } : null));
    expect(await service.list('token', 'un-po')).toEqual([
      expect.objectContaining({ id: 'commun', account: 'organization', adoptionInProgress: null, analysisInProgress: false }),
      expect.objectContaining({ id: 'un-po~en-analyse', account: 'personal', adoptionInProgress: null, analysisInProgress: true }),
      expect.objectContaining({ id: 'un-po~mon-poc', adoptionInProgress: 'https://github.com/Un-PO/mon-poc/pull/3', analysisInProgress: false }),
    ]);
  });

  it('without a stack: tags the repository, saves the analysis request under the PO\'s name and launches ADA', async () => {
    const result = await service.adopt('token', 'un-po', { repository: 'un-po~mon-poc' });
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc', names: ['vue', 'ada-reprise'] });
    expect(projects.applyLabels).toHaveBeenCalledWith(gh, 'un-po', 'mon-poc');
    expect(stories.submitPrompt).toHaveBeenCalledWith('token', 'un-po~mon-poc', expect.stringContaining('comme s’il avait été créé avec ADA'), 'un-po');
    expect(agent.analyzeAdoption).toHaveBeenCalledWith('token', 'un-po~mon-poc', 7, 'un-po', { template: null, dsfr: false });
    expect(result).toEqual({ id: 'un-po~mon-poc', analysis: 'https://github.com/un-po/mon-poc/issues/7', pullRequest: null });
  });

  it('with a stack and the DSFR: passed on to the analysis', async () => {
    await service.adopt('token', 'un-po', { repository: 'mon-poc', template: 'vue-node', dsfr: true });
    expect(stories.submitPrompt).toHaveBeenCalledWith('token', 'mon-poc', expect.stringContaining('Vue + Node'), 'un-po');
    expect(agent.analyzeAdoption).toHaveBeenCalledWith('token', 'mon-poc', 7, 'un-po', { template: 'vue-node', dsfr: true });
  });

  it('an adoption already proposed returns its PR, without a new analysis', async () => {
    gh.pulls.list.mockResolvedValue({ data: [{ html_url: 'https://github.com/un-po/mon-poc/pull/3' }] });
    expect(await service.adopt('token', 'un-po', { repository: 'un-po~mon-poc' })).toEqual({ id: 'un-po~mon-poc', analysis: null, pullRequest: 'https://github.com/un-po/mon-poc/pull/3' });
    expect(agent.analyzeAdoption).not.toHaveBeenCalled();
  });

  it('refuses: other account, unavailable stack, already in ADA, branch other than main, analysis already in progress', async () => {
    await expect(service.adopt('token', 'un-po', { repository: 'autre~poc' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.adopt('token', 'un-po', { repository: 'poc', template: 'pas-pret' })).rejects.toBeInstanceOf(BadRequestException);
    gh.repos.get.mockResolvedValueOnce({ data: repository('poc', 'proprio', ['ada']) });
    await expect(service.adopt('token', 'un-po', { repository: 'poc' })).rejects.toBeInstanceOf(ConflictException);
    gh.repos.get.mockResolvedValueOnce({ data: repository('poc', 'proprio', [], { default_branch: 'master' }) });
    await expect(service.adopt('token', 'un-po', { repository: 'poc' })).rejects.toThrow(/master/);
    agent.activeLock.mockResolvedValueOnce({ pid: 1 });
    await expect(service.adopt('token', 'un-po', { repository: 'poc' })).rejects.toThrow(/analyse déjà/);
    expect(agent.analyzeAdoption).not.toHaveBeenCalled();
  });

  it('explains that an administrator is needed when GitHub refuses to tag the repository', async () => {
    gh.repos.replaceAllTopics.mockRejectedValue(Object.assign(new Error('interdit'), { status: 403 }));
    await expect(service.adopt('token', 'un-po', { repository: 'poc' })).rejects.toThrow(/administrateur/);
    expect(stories.submitPrompt).not.toHaveBeenCalled();
  });

  describe('tracking and approval of the adoption from ADA', () => {
    const openedPullRequest = (title = 'chore: reprise du projet par ADA') => {
      gh.pulls.list.mockResolvedValue({ data: [{ html_url: 'https://github.com/un-po/mon-poc/pull/3' }] });
      gh.pulls.get.mockResolvedValue({ data: { number: 3, html_url: 'https://github.com/un-po/mon-poc/pull/3', merged: false, state: 'open', mergeable: true, title: title, head: { sha: 'tete' } } });
    };

    it('analysis in progress: no PR yet', async () => {
      agent.activeLock.mockResolvedValue({ pid: 1 });
      expect(await service.state('token', 'un-po~mon-poc')).toMatchObject({ analysisInProgress: true, pullRequest: null, mergeable: false, reason: 'ADA analyse le projet' });
    });

    it('PR ready: mergeable when the title check is green', async () => {
      openedPullRequest();
      gh.checks.listForRef.mockResolvedValue({ data: { check_runs: [{ name: 'Titre de PR (Conventional Commits, semver)', status: 'completed', conclusion: 'success' }] } });
      expect(await service.state('token', 'un-po~mon-poc')).toMatchObject({ pullRequest: { number: 3, state: 'open' }, mergeable: true });
    });

    it('PR ready but check in progress: not mergeable yet', async () => {
      openedPullRequest();
      gh.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } });
      expect(await service.state('token', 'un-po~mon-poc')).toMatchObject({ mergeable: false });
      await expect(service.merge('token', 'un-po~mon-poc')).rejects.toBeInstanceOf(ConflictException);
      expect(gh.pulls.merge).not.toHaveBeenCalled();
    });

    it('approved by the PO: squash merge, then ada topic', async () => {
      openedPullRequest();
      gh.checks.listForRef.mockResolvedValue({ data: { check_runs: [{ name: 'Titre de PR (Conventional Commits, semver)', status: 'completed', conclusion: 'success' }] } });
      gh.repos.get.mockResolvedValue({ data: repository('mon-poc', 'un-po', ['vue', 'ada-reprise']) });
      await service.merge('token', 'un-po~mon-poc');
      expect(gh.pulls.merge).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 3, merge_method: 'squash', commit_title: 'chore: reprise du projet par ADA (#3)' }));
      expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc', names: ['vue', 'ada-reprise', 'ada'] });
    });

    it('no request is launched until the adoption is merged', async () => {
      gh.repos.get.mockResolvedValue({ data: repository('mon-poc', 'un-po', ['ada-reprise']) });
      gh.repos.getContent.mockRejectedValue(Object.assign(new Error('absent'), { status: 404 }));
      await expect(service.checkAdoptionFinished('token', 'un-po~mon-poc')).rejects.toThrow(/Validez d’abord la reprise/);
      gh.repos.get.mockResolvedValue({ data: repository('mon-poc', 'un-po', ['ada']) });
      await expect(service.checkAdoptionFinished('token', 'un-po~mon-poc')).resolves.toBeUndefined();
    });
  });

  describe('cancel an adoption, or remove a project from ADA (nothing is deleted)', () => {
    beforeEach(() => {
      gh.git.deleteRef.mockResolvedValue({});
      gh.paginate.mockResolvedValue([
        { number: 7, body: 'Analyser ce projet comme s’il avait été créé avec ADA, et proposer…' },
        { number: 8, body: 'Autre demande libre' },
      ]);
    });

    it('pending adoption: PR closed, branch removed, analysis closed, marking removed', async () => {
      gh.repos.get.mockResolvedValue({ data: repository('mon-poc', 'un-po', ['vue', 'ada-reprise']) });
      gh.pulls.list.mockResolvedValue({ data: [{ html_url: 'https://github.com/un-po/mon-poc/pull/3' }] });
      expect(await service.cancel('token', 'un-po', 'un-po~mon-poc')).toEqual({ state: 'cancelled' });
      expect(gh.pulls.update).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc', pull_number: 3, state: 'closed' });
      expect(gh.git.deleteRef).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc', ref: 'heads/ada/reprise' });
      expect(gh.issues.update).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc', issue_number: 7, state: 'closed', state_reason: 'not_planned' });
      expect(gh.issues.update).not.toHaveBeenCalledWith(expect.objectContaining({ issue_number: 8 }));
      expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc', names: ['vue'] });
    });

    it('approved adoption: unlinked, only ADA\'s marking is removed', async () => {
      gh.repos.get.mockResolvedValue({ data: repository('mon-poc', 'un-po', ['vue', 'ada-reprise', 'ada']) });
      expect(await service.cancel('token', 'un-po', 'un-po~mon-poc')).toEqual({ state: 'unlinked' });
      expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc', names: ['vue'] });
      expect(gh.pulls.update).not.toHaveBeenCalled();
      expect(gh.git.deleteRef).not.toHaveBeenCalled();
      expect(gh.issues.update).not.toHaveBeenCalled();
    });

    it('project created by ADA: removed from ADA the same way, only its marking is removed', async () => {
      gh.repos.get.mockResolvedValue({ data: repository('signalements', 'proprio', ['carte', 'ada']) });
      expect(await service.cancel('token', 'un-po', 'signalements')).toEqual({ state: 'unlinked' });
      expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith({ owner: 'proprio', repo: 'signalements', names: ['carte'] });
      expect(gh.pulls.update).not.toHaveBeenCalled();
      expect(gh.git.deleteRef).not.toHaveBeenCalled();
      expect(gh.issues.update).not.toHaveBeenCalled();
    });

    it('refuses for a project that is not in ADA, or while ADA is working', async () => {
      gh.repos.get.mockResolvedValue({ data: repository('autre', 'proprio', ['vue']) });
      await expect(service.cancel('token', 'un-po', 'autre')).rejects.toThrow(/pas dans ADA/);
      agent.activeLock.mockResolvedValueOnce({ pid: 1 });
      await expect(service.cancel('token', 'un-po', 'un-po~mon-poc')).rejects.toBeInstanceOf(ConflictException);
      expect(gh.repos.replaceAllTopics).not.toHaveBeenCalled();
    });
  });

  it('readable analysis request: stack and appearance', () => {
    expect(analysisRequestText(null, false)).toContain('Stack : à déduire du projet');
    expect(analysisRequestText('Vue + Node', true)).toContain('Apparence : DSFR');
  });
});
