import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { lireConfig } from '../config.js';
import type { AgentService } from '../agent/agent.service.js';
import type { GithubService } from '../github/github.service.js';
import type { StoriesService } from '../stories/stories.service.js';
import type { ProjetsService } from './projets.service.js';
import { RepriseService, texteDemandeAnalyse } from './reprise.service.js';

const config = lireConfig({ GITHUB_PROPRIETAIRE: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32) });
const depot = (name: string, owner: string, topics: string[] = [], extra: object = {}) => ({
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

describe('RepriseService (#37)', () => {
  const gh = {
    repos: { get: vi.fn(), replaceAllTopics: vi.fn() },
    pulls: { list: vi.fn() },
  };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  const projets = {
    depotsAccessibles: vi.fn(),
    lister: vi.fn(),
    poserLabels: vi.fn(),
    aLeTopic: (d: { topics?: string[] }, ...topics: string[]) => (d.topics ?? []).some((topic) => topics.includes(topic)),
    modeles: () => ({ modeles: [{ id: 'vue-node', libelle: 'Vue + Node', disponible: true }, { id: 'pas-pret', libelle: 'X', disponible: false }] }),
  };
  const stories = { prompter: vi.fn() };
  const agent = { verifierDisponible: vi.fn(), verrouActif: vi.fn(), analyserReprise: vi.fn() };
  let service: RepriseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RepriseService(config, github, projets as unknown as ProjetsService, stories as unknown as StoriesService, agent as unknown as AgentService);
    gh.repos.get.mockResolvedValue({ data: depot('mon-poc', 'un-po', ['vue']) });
    gh.repos.replaceAllTopics.mockResolvedValue({});
    gh.pulls.list.mockResolvedValue({ data: [] });
    stories.prompter.mockResolvedValue({ numero: 7 });
    agent.verrouActif.mockResolvedValue(null);
    agent.analyserReprise.mockResolvedValue(undefined);
  });

  it('liste les dépôts pas encore dans ADA, avec l’état de leur reprise (analyse en cours, PR à fusionner)', async () => {
    projets.depotsAccessibles.mockResolvedValue([
      depot('deja', 'proprio', ['ada']),
      depot('commun', 'proprio'),
      depot('archive', 'proprio', [], { archived: true }),
      depot('lecture-seule', 'proprio', [], { permissions: { push: false } }),
      depot('en-analyse', 'Un-PO', ['ada-reprise']),
      depot('mon-poc', 'Un-PO', ['ada-reprise']),
    ]);
    projets.lister.mockResolvedValue([{ id: 'deja' }]);
    gh.pulls.list.mockImplementation(async ({ repo }: { repo: string }) => ({ data: repo === 'mon-poc' ? [{ html_url: 'https://github.com/Un-PO/mon-poc/pull/3' }] : [] }));
    agent.verrouActif.mockImplementation(async (id: string) => (id === 'un-po~en-analyse' ? { pid: 1 } : null));
    expect(await service.lister('jeton', 'un-po')).toEqual([
      expect.objectContaining({ id: 'commun', compte: 'organisation', repriseEnCours: null, analyseEnCours: false }),
      expect.objectContaining({ id: 'un-po~en-analyse', compte: 'personnel', repriseEnCours: null, analyseEnCours: true }),
      expect.objectContaining({ id: 'un-po~mon-poc', repriseEnCours: 'https://github.com/Un-PO/mon-poc/pull/3', analyseEnCours: false }),
    ]);
  });

  it('sans stack : marque le dépôt, enregistre la demande d’analyse au nom du PO et lance l’assistant', async () => {
    const resultat = await service.reprendre('jeton', 'un-po', { depot: 'un-po~mon-poc' });
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc', names: ['vue', 'ada-reprise'] });
    expect(projets.poserLabels).toHaveBeenCalledWith(gh, 'un-po', 'mon-poc');
    expect(stories.prompter).toHaveBeenCalledWith('jeton', 'un-po~mon-poc', expect.stringContaining('comme s’il avait été créé avec ADA'), 'un-po');
    expect(agent.analyserReprise).toHaveBeenCalledWith('jeton', 'un-po~mon-poc', 7, 'un-po', { modele: null, dsfr: false });
    expect(resultat).toEqual({ analyse: 'https://github.com/un-po/mon-poc/issues/7', pullRequest: null });
  });

  it('avec une stack et le DSFR : transmis à l’analyse', async () => {
    await service.reprendre('jeton', 'un-po', { depot: 'mon-poc', modele: 'vue-node', dsfr: true });
    expect(stories.prompter).toHaveBeenCalledWith('jeton', 'mon-poc', expect.stringContaining('Vue + Node'), 'un-po');
    expect(agent.analyserReprise).toHaveBeenCalledWith('jeton', 'mon-poc', 7, 'un-po', { modele: 'vue-node', dsfr: true });
  });

  it('une reprise déjà proposée renvoie sa PR, sans nouvelle analyse', async () => {
    gh.pulls.list.mockResolvedValue({ data: [{ html_url: 'https://github.com/un-po/mon-poc/pull/3' }] });
    expect(await service.reprendre('jeton', 'un-po', { depot: 'un-po~mon-poc' })).toEqual({ analyse: null, pullRequest: 'https://github.com/un-po/mon-poc/pull/3' });
    expect(agent.analyserReprise).not.toHaveBeenCalled();
  });

  it('refuse : autre compte, stack indisponible, déjà dans ADA, branche autre que main, analyse déjà en cours', async () => {
    await expect(service.reprendre('jeton', 'un-po', { depot: 'autre~poc' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reprendre('jeton', 'un-po', { depot: 'poc', modele: 'pas-pret' })).rejects.toBeInstanceOf(BadRequestException);
    gh.repos.get.mockResolvedValueOnce({ data: depot('poc', 'proprio', ['ada']) });
    await expect(service.reprendre('jeton', 'un-po', { depot: 'poc' })).rejects.toBeInstanceOf(ConflictException);
    gh.repos.get.mockResolvedValueOnce({ data: depot('poc', 'proprio', [], { default_branch: 'master' }) });
    await expect(service.reprendre('jeton', 'un-po', { depot: 'poc' })).rejects.toThrow(/master/);
    agent.verrouActif.mockResolvedValueOnce({ pid: 1 });
    await expect(service.reprendre('jeton', 'un-po', { depot: 'poc' })).rejects.toThrow(/analyse déjà/);
    expect(agent.analyserReprise).not.toHaveBeenCalled();
  });

  it('explique qu’il faut un administrateur quand GitHub refuse de marquer le dépôt', async () => {
    gh.repos.replaceAllTopics.mockRejectedValue(Object.assign(new Error('interdit'), { status: 403 }));
    await expect(service.reprendre('jeton', 'un-po', { depot: 'poc' })).rejects.toThrow(/administrateur/);
    expect(stories.prompter).not.toHaveBeenCalled();
  });

  it('demande d’analyse lisible : stack et apparence', () => {
    expect(texteDemandeAnalyse(null, false)).toContain('Stack : à déduire du projet');
    expect(texteDemandeAnalyse('Vue + Node', true)).toContain('Apparence : DSFR');
  });
});
