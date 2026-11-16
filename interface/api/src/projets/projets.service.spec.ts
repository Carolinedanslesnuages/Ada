import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { lireConfig } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import { ProjetsService } from './projets.service.js';

const config = lireConfig({
  GITHUB_PROPRIETAIRE: 'proprio',
  GITHUB_CLIENT_ID: 'Iv',
  GITHUB_CLIENT_SECRET: 's',
  SESSION_SECRET: 'x'.repeat(32),
});

const depot = (name: string, topics: string[], updated_at = '2026-11-16T10:00:00Z') => ({
  name,
  topics,
  updated_at,
  description: null,
  private: true,
  html_url: `https://github.com/proprio/${name}`,
});

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('ProjetsService', () => {
  const gh = {
    paginate: vi.fn(),
    request: vi.fn(),
    repos: {
      listForAuthenticatedUser: vi.fn(),
      listForOrg: vi.fn(),
      get: vi.fn(),
      createUsingTemplate: vi.fn(),
      getContent: vi.fn(),
      replaceAllTopics: vi.fn(),
      update: vi.fn(),
    },
    issues: { createLabel: vi.fn() },
    git: { getRef: vi.fn(), getCommit: vi.fn(), createTree: vi.fn(), createCommit: vi.fn(), updateRef: vi.fn() },
  };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  let service: ProjetsService;

  const projetValide = { nom: "L'annuaire", objectif: 'Trouver un collègue et son bureau', modele: 'vue-nest-dsfr' };

  /** Dépôts modèles : présents et « template » ; autres dépôts : selon le test (404 par défaut). */
  const reposGet = (projet: () => Promise<unknown>) =>
    gh.repos.get.mockImplementation(async ({ repo }: { repo: string }) =>
      repo.startsWith('modele-') ? { data: { is_template: true } } : projet(),
    );

  const preparerCreation = () => {
    reposGet(() => Promise.reject({ status: 404 }));
    gh.repos.createUsingTemplate.mockResolvedValue({ data: depot('l-annuaire', []) });
    gh.repos.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === 'ada.json') throw { status: 404 };
      return { data: { type: 'file', content: b64(path === 'PROJET.md' ? '# __NOM_PROJET__\n__OBJECTIF__' : 'sans marqueur') } };
    });
    gh.git.getRef.mockResolvedValue({ data: { object: { sha: 'parent' } } });
    gh.git.getCommit.mockResolvedValue({ data: { tree: { sha: 'arbre-parent' } } });
    gh.git.createTree.mockResolvedValue({ data: { sha: 'arbre' } });
    gh.git.createCommit.mockResolvedValue({ data: { sha: 'commit' } });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProjetsService(config, github);
    service.attenteMs = 0;
  });

  it('liste les projets ADA et ceux créés avant le renommage (topic atelier-po), sans passer par la recherche', async () => {
    gh.paginate.mockResolvedValue([
      depot('ancien', ['atelier-po'], '2026-01-01T00:00:00Z'),
      depot('autre', ['perso']),
      depot('recent', ['ada'], '2026-11-16T00:00:00Z'),
    ]);
    const projets = await service.lister('jeton', 'Proprio');
    expect(gh.paginate).toHaveBeenCalledWith(gh.repos.listForAuthenticatedUser, expect.objectContaining({ affiliation: 'owner' }));
    expect(projets.map((p) => p.nom)).toEqual(['recent', 'ancien']);
  });

  it('liste les dépôts de l’organisation quand le propriétaire n’est pas le PO', async () => {
    gh.paginate.mockResolvedValue([]);
    await service.lister('jeton', 'un-po');
    expect(gh.paginate).toHaveBeenCalledWith(gh.repos.listForOrg, expect.objectContaining({ org: 'proprio' }));
  });

  it('refuse un projet invalide sans rien créer', async () => {
    await expect(service.creer('jeton', 'po', { nom: 'x', objectif: '', modele: '' })).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.repos.createUsingTemplate).not.toHaveBeenCalled();
  });

  it('ne propose que les modèles publiés sur GitHub (dépôt « template »)', async () => {
    gh.repos.get.mockImplementation(async ({ repo }: { repo: string }) => {
      if (repo === 'modele-vue-nest-dsfr') return { data: { is_template: true } };
      if (repo === 'modele-maquette') return { data: { is_template: false } };
      throw { status: 404 };
    });
    const { types, modeles } = await service.modeles('jeton');
    expect(types.map((t) => t.id)).toEqual(['service', 'formulaire', 'extension', 'maquette']);
    expect(modeles.filter((m) => m.depot).map((m) => m.id)).toEqual(['vue-nest-dsfr']);
    expect(modeles.find((m) => m.id === 'formulaire')).toMatchObject({ type: 'formulaire', depot: null });
  });

  it('refuse une stack dont le modèle n’existe pas encore', async () => {
    gh.repos.get.mockImplementation(async ({ repo }: { repo: string }) => {
      if (repo === 'modele-django' || !repo.startsWith('modele-')) throw { status: 404 };
      return { data: { is_template: true } };
    });
    await expect(service.creer('jeton', 'po', { ...projetValide, modele: 'django' })).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.repos.createUsingTemplate).not.toHaveBeenCalled();
  });

  it('refuse un nom déjà pris', async () => {
    reposGet(async () => ({ data: {} }));
    await expect(service.creer('jeton', 'po', projetValide)).rejects.toBeInstanceOf(ConflictException);
    expect(gh.repos.createUsingTemplate).not.toHaveBeenCalled();
  });

  it('crée le dépôt privé depuis le modèle, le personnalise en un commit et pose le topic', async () => {
    preparerCreation();
    gh.request.mockResolvedValue({});
    const resultat = await service.creer('jeton', 'po1', projetValide);

    expect(gh.repos.createUsingTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ template_owner: 'proprio', template_repo: 'modele-vue-nest-dsfr', owner: 'proprio', name: 'l-annuaire', private: true }),
    );
    const arbre = gh.git.createTree.mock.calls[0][0];
    expect(arbre.base_tree).toBe('arbre-parent');
    expect(arbre.tree).toEqual([
      expect.objectContaining({ path: 'PROJET.md', content: '# L’annuaire\nTrouver un collègue et son bureau.' }),
    ]);
    expect(gh.git.createCommit).toHaveBeenCalledWith(expect.objectContaining({ parents: ['parent'], message: 'chore: personnalisation du projet L’annuaire' }));
    expect(gh.git.updateRef).toHaveBeenCalledWith(expect.objectContaining({ ref: 'heads/main', sha: 'commit' }));
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith(expect.objectContaining({ names: ['ada'] }));
    expect(gh.repos.update).toHaveBeenCalledWith(
      expect.objectContaining({ repo: 'l-annuaire', allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, delete_branch_on_merge: true }),
    );
    const labels = gh.issues.createLabel.mock.calls.map((appel) => (appel[0] as { name: string }).name);
    expect(labels).toEqual(expect.arrayContaining(['user-story', 'bug', 'story:en-cours', 'story:besoin-dev']));
    expect(gh.request.mock.invocationCallOrder[0]).toBeLessThan(gh.git.createCommit.mock.invocationCallOrder[0]);
    expect(resultat.reglages.versionsAutomatiques.etat).toBe('fait');
    expect(resultat.reglages.protectionMain.etat).toBe('fait');
  });

  it('explique au PO que l’App n’a pas accès au modèle (404 de GitHub)', async () => {
    reposGet(() => Promise.reject({ status: 404 }));
    gh.repos.createUsingTemplate.mockRejectedValue({ status: 404, request: { method: 'POST', url: 'x' } });
    await expect(service.creer('jeton', 'po1', projetValide)).rejects.toThrow(/Repository access/);
  });

  it('tolère un label déjà présent dans le dépôt (« bug » existe par défaut)', async () => {
    preparerCreation();
    gh.request.mockResolvedValue({});
    gh.issues.createLabel.mockImplementation(async ({ name }: { name: string }) => {
      if (name === 'bug') throw { status: 422 };
    });
    await expect(service.creer('jeton', 'po1', projetValide)).resolves.toBeDefined();
  });

  it('reprend une création interrompue (dépôt issu du modèle, sans topic) au lieu de refuser', async () => {
    preparerCreation();
    gh.request.mockResolvedValue({});
    reposGet(async () => ({ data: { ...depot('l-annuaire', []), template_repository: { full_name: 'proprio/modele-vue-nest-dsfr' } } }));
    const resultat = await service.creer('jeton', 'po1', projetValide);
    expect(gh.repos.createUsingTemplate).not.toHaveBeenCalled();
    expect(gh.git.updateRef).toHaveBeenCalled();
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith(expect.objectContaining({ names: ['ada'] }));
    expect(resultat.projet.nom).toBe('l-annuaire');
  });

  it('refuse toujours un dépôt existant qui n’est pas une création d’ADA en cours', async () => {
    reposGet(async () => ({ data: { ...depot('l-annuaire', ['ada']), template_repository: { full_name: 'proprio/modele-vue-nest-dsfr' } } }));
    await expect(service.creer('jeton', 'po1', projetValide)).rejects.toBeInstanceOf(ConflictException);
    reposGet(async () => ({ data: { ...depot('l-annuaire', []), template_repository: null } }));
    await expect(service.creer('jeton', 'po1', projetValide)).rejects.toBeInstanceOf(ConflictException);
    expect(gh.repos.createUsingTemplate).not.toHaveBeenCalled();
  });

  it('crée le projet même si GitHub refuse le réglage de fusion', async () => {
    preparerCreation();
    gh.request.mockResolvedValue({});
    gh.repos.update.mockRejectedValueOnce({ status: 403 });
    await expect(service.creer('jeton', 'po1', projetValide)).resolves.toBeDefined();
  });

  it('personnalise et protège main selon l’ada.json du modèle', async () => {
    preparerCreation();
    gh.request.mockResolvedValue({});
    gh.repos.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === 'ada.json')
        return { data: { type: 'file', content: b64(JSON.stringify({ type: 'maquette', personnaliser: ['index.html'], controlesRequis: ['Maquette (tests)'], controles: ['npm test'], apercu: { npm: ['.'], principal: 'npx vite' } })) } };
      return { data: { type: 'file', content: b64(path === 'index.html' ? '<title>__NOM_PROJET__</title>' : 'x') } };
    });
    await service.creer('jeton', 'po1', { ...projetValide, modele: 'maquette' });
    expect(gh.git.createTree.mock.calls[0][0].tree).toEqual([expect.objectContaining({ path: 'index.html', content: '<title>L’annuaire</title>' })]);
    const regles = gh.request.mock.calls.find(([route]) => String(route).includes('rulesets'))![1] as { rules: { type: string; parameters?: { required_status_checks?: { context: string }[] } }[] };
    expect(regles.rules.find((r) => r.type === 'required_status_checks')!.parameters!.required_status_checks).toEqual([{ context: 'Maquette (tests)' }]);
  });

  it('attend que GitHub ait fini de copier le modèle', async () => {
    preparerCreation();
    gh.request.mockResolvedValue({});
    const normal = gh.repos.getContent.getMockImplementation()!;
    gh.repos.getContent.mockRejectedValueOnce({ status: 404 }).mockRejectedValueOnce({ status: 409 }).mockImplementation(normal);
    await service.creer('jeton', 'po1', projetValide);
    expect(gh.git.updateRef).toHaveBeenCalled();
  });

  it('signale au PO les réglages que GitHub refuse (compte gratuit, organisation)', async () => {
    preparerCreation();
    gh.request.mockRejectedValue({ status: 403 });
    const resultat = await service.creer('jeton', 'po1', projetValide);
    expect(resultat.reglages).toEqual({
      versionsAutomatiques: { etat: 'a-faire', lien: 'https://github.com/proprio/l-annuaire/settings/actions' },
      protectionMain: { etat: 'a-faire', lien: 'https://github.com/proprio/l-annuaire/settings/rules' },
    });
  });
});
