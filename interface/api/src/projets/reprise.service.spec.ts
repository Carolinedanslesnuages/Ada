import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ADA_PAR_DEFAUT } from '../ada/ada-config.js';
import { lireConfig } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import type { ProjetsService } from './projets.service.js';
import { adaJsonReprise, BRANCHE_REPRISE, FICHIERS_REPRISE, RepriseService, TITRE_REPRISE } from './reprise.service.js';

const catalogue = mkdtempSync(join(tmpdir(), 'ada-test-reprise-'));
for (const fichier of [...FICHIERS_REPRISE, 'ada.json']) {
  const chemin = join(catalogue, 'vue-node', fichier);
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, fichier === 'ada.json' ? JSON.stringify({ ...ADA_PAR_DEFAUT, personnaliser: ['README.md'], deploiement: { chart: 'charts/app' } }) : `contenu de ${fichier}`);
}
afterAll(() => rmSync(catalogue, { recursive: true, force: true }));

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
const absent = () => Object.assign(new Error('absent'), { status: 404 });

describe('RepriseService (#37)', () => {
  const gh = {
    repos: { get: vi.fn(), getContent: vi.fn(), replaceAllTopics: vi.fn() },
    pulls: { list: vi.fn(), create: vi.fn() },
    git: { getRef: vi.fn(), getCommit: vi.fn(), createTree: vi.fn(), createCommit: vi.fn(), createRef: vi.fn(), updateRef: vi.fn() },
  };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  const projets = {
    dossierCatalogue: catalogue,
    depotsAccessibles: vi.fn(),
    lister: vi.fn(),
    poserLabels: vi.fn(),
    aLeTopic: (d: { topics?: string[] }, ...topics: string[]) => (d.topics ?? []).some((topic) => topics.includes(topic)),
    modeles: () => ({ modeles: [{ id: 'vue-node', libelle: 'Vue + Node', disponible: true }, { id: 'pas-pret', libelle: 'X', disponible: false }] }),
  };
  let service: RepriseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RepriseService(config, github, projets as unknown as ProjetsService);
    gh.repos.get.mockResolvedValue({ data: depot('mon-poc', 'un-po', ['vue']) });
    gh.repos.getContent.mockRejectedValue(absent());
    gh.repos.replaceAllTopics.mockResolvedValue({});
    gh.pulls.list.mockResolvedValue({ data: [] });
    gh.pulls.create.mockResolvedValue({ data: { html_url: 'https://github.com/un-po/mon-poc/pull/3' } });
    gh.git.getRef.mockResolvedValue({ data: { object: { sha: 'sha-main' } } });
    gh.git.getCommit.mockResolvedValue({ data: { tree: { sha: 'arbre-main' } } });
    gh.git.createTree.mockResolvedValue({ data: { sha: 'arbre' } });
    gh.git.createCommit.mockResolvedValue({ data: { sha: 'commit' } });
    gh.git.createRef.mockResolvedValue({});
  });

  it('liste les dépôts accessibles qui ne sont pas encore dans ADA, et signale une reprise en attente', async () => {
    projets.depotsAccessibles.mockResolvedValue([
      depot('deja', 'proprio', ['ada']),
      depot('commun', 'proprio'),
      depot('archive', 'proprio', [], { archived: true }),
      depot('lecture-seule', 'proprio', [], { permissions: { push: false } }),
      depot('mon-poc', 'Un-PO', ['ada-reprise']),
    ]);
    projets.lister.mockResolvedValue([{ id: 'deja' }]);
    gh.pulls.list.mockResolvedValue({ data: [{ html_url: 'https://github.com/Un-PO/mon-poc/pull/3' }] });
    const liste = await service.lister('jeton', 'un-po');
    expect(liste).toEqual([
      expect.objectContaining({ id: 'commun', compte: 'organisation', repriseEnCours: null }),
      expect.objectContaining({ id: 'un-po~mon-poc', compte: 'personnel', repriseEnCours: 'https://github.com/Un-PO/mon-poc/pull/3' }),
    ]);
  });

  it('ouvre une PR « reprise par ADA » avec les seuls fichiers manquants, sans toucher main', async () => {
    gh.repos.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '.github/ISSUE_TEMPLATE/bug.yml') return { data: {} };
      throw absent();
    });
    const resultat = await service.reprendre('jeton', 'un-po', { depot: 'un-po~mon-poc', modele: 'vue-node' });

    expect(resultat.pullRequest).toBe('https://github.com/un-po/mon-poc/pull/3');
    expect(resultat.fichiers).not.toContain('.github/ISSUE_TEMPLATE/bug.yml');
    expect(resultat.fichiers).toEqual(expect.arrayContaining(['.github/ISSUE_TEMPLATE/user-story.yml', '.github/workflows/titre-pr.yml', 'ada.json']));
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc', names: ['vue', 'ada-reprise'] });
    expect(gh.git.createTree).toHaveBeenCalledWith(expect.objectContaining({ base_tree: 'arbre-main' }));
    expect(gh.git.createCommit).toHaveBeenCalledWith(expect.objectContaining({ parents: ['sha-main'], author: { name: 'un-po', email: 'un-po@users.noreply.github.com' } }));
    expect(gh.git.createRef).toHaveBeenCalledWith(expect.objectContaining({ ref: `refs/heads/${BRANCHE_REPRISE}`, sha: 'commit' }));
    expect(gh.git.updateRef).not.toHaveBeenCalledWith(expect.objectContaining({ ref: 'heads/main' }));
    expect(projets.poserLabels).toHaveBeenCalledWith(gh, 'un-po', 'mon-poc');
    expect(gh.pulls.create).toHaveBeenCalledWith(expect.objectContaining({ head: BRANCHE_REPRISE, base: 'main', title: TITRE_REPRISE }));
  });

  it('rejouée, renvoie la PR déjà ouverte sans rien repousser', async () => {
    gh.pulls.list.mockResolvedValue({ data: [{ html_url: 'https://github.com/un-po/mon-poc/pull/3' }] });
    const resultat = await service.reprendre('jeton', 'un-po', { depot: 'un-po~mon-poc', modele: 'vue-node' });
    expect(resultat).toEqual({ pullRequest: 'https://github.com/un-po/mon-poc/pull/3', fichiers: [] });
    expect(gh.git.createCommit).not.toHaveBeenCalled();
  });

  it('remplace la branche d’une reprise interrompue', async () => {
    gh.git.createRef.mockRejectedValue(Object.assign(new Error('existe'), { status: 422 }));
    await service.reprendre('jeton', 'un-po', { depot: 'un-po~mon-poc', modele: 'vue-node' });
    expect(gh.git.updateRef).toHaveBeenCalledWith(expect.objectContaining({ ref: `heads/${BRANCHE_REPRISE}`, force: true }));
  });

  it('refuse le dépôt d’un autre compte, une stack indisponible, un projet déjà dans ADA ou une branche principale autre que main', async () => {
    await expect(service.reprendre('jeton', 'un-po', { depot: 'autre~poc', modele: 'vue-node' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reprendre('jeton', 'un-po', { depot: 'poc', modele: 'pas-pret' })).rejects.toBeInstanceOf(BadRequestException);
    gh.repos.get.mockResolvedValueOnce({ data: depot('poc', 'proprio', ['ada']) });
    await expect(service.reprendre('jeton', 'un-po', { depot: 'poc', modele: 'vue-node' })).rejects.toBeInstanceOf(ConflictException);
    gh.repos.get.mockResolvedValueOnce({ data: depot('poc', 'proprio', [], { default_branch: 'master' }) });
    await expect(service.reprendre('jeton', 'un-po', { depot: 'poc', modele: 'vue-node' })).rejects.toThrow(/master/);
    expect(gh.pulls.create).not.toHaveBeenCalled();
  });

  it('explique qu’il faut un administrateur quand GitHub refuse de marquer le dépôt', async () => {
    gh.repos.replaceAllTopics.mockRejectedValue(Object.assign(new Error('interdit'), { status: 403 }));
    await expect(service.reprendre('jeton', 'un-po', { depot: 'poc', modele: 'vue-node' })).rejects.toThrow(/administrateur/);
    expect(gh.git.createCommit).not.toHaveBeenCalled();
  });

  it('code existant : par défaut, ada.json garde l’apparence du projet (sans DSFR) ; DSFR sur demande du PO', async () => {
    await service.reprendre('jeton', 'un-po', { depot: 'un-po~mon-poc', modele: 'vue-node' });
    const ada = (gh.git.createTree.mock.calls[0]![0] as { tree: { path: string; content: string }[] }).tree.find((fichier) => fichier.path === 'ada.json')!;
    expect(JSON.parse(ada.content)).toMatchObject({ dsfr: false });
    expect(gh.pulls.create).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('celle du projet') }));
    expect(JSON.parse(adaJsonReprise(JSON.stringify(ADA_PAR_DEFAUT), true))).toMatchObject({ dsfr: true });
  });

  it('ada.json repris : aperçu du modèle, aucun fichier à personnaliser, seul le titre de PR exigé, pas de chart', () => {
    const ada = JSON.parse(adaJsonReprise(JSON.stringify({ ...ADA_PAR_DEFAUT, personnaliser: ['README.md'], deploiement: { chart: 'charts/app' } }))) as Record<string, unknown>;
    expect(ada).toMatchObject({ personnaliser: [], controlesRequis: ['Titre de PR (Conventional Commits, semver)'], deploiement: null, apercu: ADA_PAR_DEFAUT.apercu });
  });
});
