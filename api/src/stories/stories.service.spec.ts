import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Config } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import { StoriesService } from './stories.service.js';

const config = { GITHUB_PROPRIETAIRE: 'proprio' } as Config;

const issue = (numero: number, extra: Record<string, unknown> = {}) => ({
  number: numero,
  title: `Story ${numero}`,
  state: 'open',
  created_at: '2026-11-16T10:00:00Z',
  html_url: `https://github.com/proprio/poc/issues/${numero}`,
  labels: [{ name: 'user-story' }],
  ...extra,
});

const storyValide = {
  titre: 'Voir les salles libres',
  role: "agent d'accueil",
  besoin: 'voir les salles libres',
  benefice: 'proposer une salle rapidement',
  criteres: ['une salle sans réservation en cours est libre'],
};

describe('StoriesService', () => {
  const gh = {
    issues: {
      listForRepo: vi.fn(),
      create: vi.fn(),
      getLabel: vi.fn(),
      createLabel: vi.fn(),
      get: vi.fn(),
      listComments: vi.fn(),
      createComment: vi.fn(),
    },
  };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  let service: StoriesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StoriesService(config, github);
  });

  it('liste les stories du dépôt en excluant les pull requests', async () => {
    gh.issues.listForRepo.mockResolvedValue({
      data: [issue(1), issue(2, { pull_request: {} }), issue(3, { state: 'closed' })],
    });
    const liste = await service.lister('jeton', 'poc');
    expect(gh.issues.listForRepo).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'proprio', repo: 'poc', labels: 'user-story', state: 'all' }),
    );
    expect(liste.map((s) => [s.numero, s.statut])).toEqual([
      [1, 'nouvelle'],
      [3, 'livree'],
    ]);
  });

  it('refuse une story invalide sans rien envoyer à GitHub', async () => {
    await expect(
      service.creer('jeton', 'poc', { ...storyValide, criteres: ['a b c', 'd e f', 'g h i', 'j k l', 'm n o'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.issues.create).not.toHaveBeenCalled();
  });

  it('crée le label s’il manque, puis l’issue avec le corps structuré', async () => {
    gh.issues.getLabel.mockRejectedValue({ status: 404 });
    gh.issues.create.mockResolvedValue({ data: issue(7) });
    const story = await service.creer('jeton', 'poc', storyValide);
    expect(gh.issues.createLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'user-story' }));
    const appel = gh.issues.create.mock.calls[0][0];
    expect(appel.title).toBe('Voir les salles libres');
    expect(appel.labels).toEqual(['user-story']);
    expect(appel.body).toContain("**En tant que** agent d'accueil,");
    expect(story.numero).toBe(7);
  });

  it('rassemble la story et la conversation', async () => {
    gh.issues.get.mockResolvedValue({ data: issue(4, { body: 'texte libre' }) });
    gh.issues.listComments.mockResolvedValue({
      data: [{ id: 1, user: { login: 'po', avatar_url: 'a.png' }, body: 'Bonjour', created_at: '2026-11-16T11:00:00Z' }],
    });
    const detail = await service.detail('jeton', 'poc', 4);
    expect(detail.contenu).toBeNull();
    expect(detail.messages).toEqual([
      { id: 1, auteur: 'po', avatar: 'a.png', texte: 'Bonjour', le: '2026-11-16T11:00:00Z' },
    ]);
  });

  it('traduit un « introuvable » de GitHub', async () => {
    gh.issues.listForRepo.mockRejectedValue({ status: 404 });
    await expect(service.lister('jeton', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse un message vide', async () => {
    await expect(service.repondre('jeton', 'poc', 1, '   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.issues.createComment).not.toHaveBeenCalled();
  });
});
