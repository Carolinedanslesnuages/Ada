import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Config } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import { StoriesService } from './stories.service.js';

const config = { GITHUB_PROPRIETAIRE: 'proprio' } as Config;

const corpsStory = (criteres: string[]) =>
  [
    '### En tant que',
    '',
    'agent',
    '',
    '### Je veux',
    '',
    'voir ma journée',
    '',
    '### Afin de',
    '',
    'm’organiser',
    '',
    "### Critères d'acceptation",
    '',
    ...criteres.map((c) => `- ${c}`),
  ].join('\n');

const issue = (numero: number, extra: Record<string, unknown> = {}) => ({
  number: numero,
  title: `Story ${numero}`,
  state: 'open',
  created_at: '2026-11-16T10:00:00Z',
  html_url: `https://github.com/proprio/poc/issues/${numero}`,
  labels: [{ name: 'user-story' }],
  body: corpsStory(['un critère']),
  ...extra,
});

describe('StoriesService', () => {
  const gh = {
    paginate: vi.fn(async (_methode: unknown, _options: unknown) => [] as unknown[]),
    issues: {
      listForRepo: vi.fn(),
      get: vi.fn(),
      listComments: vi.fn(),
      createComment: vi.fn(),
      addLabels: vi.fn(),
      getLabel: vi.fn(),
      createLabel: vi.fn(),
    },
  };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  let service: StoriesService;

  const depot = (stories: unknown[], bugs: unknown[] = []) => gh.paginate.mockResolvedValue([...stories, ...bugs]);

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StoriesService(config, github);
  });

  it('liste stories et problèmes écrits dans GitHub, sans pull request, et dit s’ils sont prêts', async () => {
    depot(
      [issue(1), issue(2, { pull_request: {} }), issue(3, { body: corpsStory(['a', 'b', 'c', 'd', 'e']) })],
      [issue(5, { labels: [{ name: 'bug' }], body: 'texte libre' })],
    );
    const liste = await service.lister('jeton', 'poc');
    expect(liste.map((s) => [s.numero, s.type, s.prete])).toEqual([
      [5, 'bug', false],
      [3, 'story', false],
      [1, 'story', true],
    ]);
    expect(liste[1]!.raison).toMatch(/Plus de 4 critères/);
  });

  it('montre une story écrite avec le formulaire même si le label manquait dans le dépôt', async () => {
    depot([issue(1, { labels: [] }), issue(2, { labels: [], body: 'Question libre' })]);
    const liste = await service.lister('jeton', 'poc');
    expect(liste.map((s) => [s.numero, s.type, s.prete])).toEqual([[1, 'story', true]]);
  });

  it('lance une story prête : label « en cours » et trace dans GitHub', async () => {
    depot([issue(1), issue(2)]);
    gh.issues.getLabel.mockRejectedValue({ status: 404 });
    const lancee = await service.lancer('jeton', 'poc', 2, 'po1');
    expect(gh.issues.createLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'user-story' }));
    expect(gh.issues.createLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'story:en-cours' }));
    expect(gh.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 2, labels: ['user-story', 'story:en-cours'] }),
    );
    expect(gh.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 2, body: '▶️ Lancée depuis ADA par po1.' }),
    );
    expect(lancee.statut).toBe('en-cours');
  });

  it('refuse d’en lancer une deuxième tant qu’une autre est en cours', async () => {
    depot([issue(1, { labels: [{ name: 'user-story' }, { name: 'story:questions' }] }), issue(2)]);
    await expect(service.lancer('jeton', 'poc', 2, 'po1')).rejects.toThrow(/#1 .* est en cours : une seule demande à la fois/);
    expect(gh.issues.addLabels).not.toHaveBeenCalled();
  });

  it('refuse une story trop grosse, avec la raison', async () => {
    depot([issue(4, { body: corpsStory(['a', 'b', 'c', 'd', 'e']) })]);
    await expect(service.lancer('jeton', 'poc', 4, 'po1')).rejects.toThrow(/pas prête : Plus de 4 critères/);
    expect(gh.issues.addLabels).not.toHaveBeenCalled();
  });

  it('refuse de relancer une demande déjà lancée ou livrée', async () => {
    depot([issue(6, { state: 'closed' })]);
    await expect(service.lancer('jeton', 'poc', 6, 'po1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuse une issue qui n’est ni une story ni un problème', async () => {
    depot([]);
    await expect(service.lancer('jeton', 'poc', 99, 'po1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rassemble la demande et la conversation', async () => {
    gh.issues.get.mockResolvedValue({ data: issue(4) });
    gh.issues.listComments.mockResolvedValue({
      data: [{ id: 1, user: { login: 'po', avatar_url: 'a.png' }, body: 'Bonjour', created_at: '2026-11-16T11:00:00Z' }],
    });
    const detail = await service.detail('jeton', 'poc', 4);
    expect(detail.contenu?.criteres).toEqual(['un critère']);
    expect(detail.messages).toEqual([
      { id: 1, auteur: 'po', avatar: 'a.png', texte: 'Bonjour', le: '2026-11-16T11:00:00Z' },
    ]);
  });

  it('traduit un « introuvable » de GitHub', async () => {
    gh.paginate.mockRejectedValue({ status: 404 });
    await expect(service.lister('jeton', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse un message vide', async () => {
    await expect(service.repondre('jeton', 'poc', 1, '   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.issues.createComment).not.toHaveBeenCalled();
  });
});
