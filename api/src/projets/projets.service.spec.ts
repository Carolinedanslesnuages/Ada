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
    },
    git: { getRef: vi.fn(), getCommit: vi.fn(), createTree: vi.fn(), createCommit: vi.fn(), updateRef: vi.fn() },
  };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  let service: ProjetsService;

  const projetValide = { nom: "L'annuaire", objectif: 'Trouver un collègue et son bureau', modele: 'vue-nest-dsfr' };

  const preparerCreation = () => {
    gh.repos.get.mockRejectedValue({ status: 404 });
    gh.repos.createUsingTemplate.mockResolvedValue({ data: depot('l-annuaire', []) });
    gh.repos.getContent.mockImplementation(async ({ path }: { path: string }) => ({
      data: { type: 'file', content: b64(path === 'PROJET.md' ? '# __NOM_PROJET__\n__OBJECTIF__' : 'sans marqueur') },
    }));
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

  it('liste les dépôts du compte portant le topic de l’atelier, sans passer par la recherche', async () => {
    gh.paginate.mockResolvedValue([
      depot('ancien', ['atelier-po'], '2026-01-01T00:00:00Z'),
      depot('autre', ['perso']),
      depot('recent', ['atelier-po'], '2026-11-16T00:00:00Z'),
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

  it('refuse une stack dont le modèle n’existe pas encore', async () => {
    await expect(service.creer('jeton', 'po', { ...projetValide, modele: 'django' })).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.repos.createUsingTemplate).not.toHaveBeenCalled();
  });

  it('refuse un nom déjà pris', async () => {
    gh.repos.get.mockResolvedValue({ data: {} });
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
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith(expect.objectContaining({ names: ['atelier-po'] }));
    expect(resultat.reglages.versionsAutomatiques.etat).toBe('fait');
    expect(resultat.reglages.protectionMain.etat).toBe('fait');
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
