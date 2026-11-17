import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Config } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import { MARQUEUR_ASSISTANT, StoriesService } from './stories.service.js';
import { ajouterDecoupage, cocherEnfant, formaterStory, lireParent, lireStory, texteDecoupage } from './story.js';

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
      create: vi.fn(),
      update: vi.fn(),
      setLabels: vi.fn(),
      listAssignees: vi.fn(),
      addAssignees: vi.fn(),
      removeAssignees: vi.fn(),
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

  it('donne la date de livraison d’une story fermée (rangée dans « Déjà livrées »)', async () => {
    depot([issue(1, { state: 'closed', closed_at: '2026-11-16T18:00:00Z' }), issue(2)]);
    const liste = await service.lister('jeton', 'poc');
    expect(liste.map((s) => [s.numero, s.statut, s.fermeeLe])).toEqual([
      [2, 'nouvelle', null],
      [1, 'livree', '2026-11-16T18:00:00Z'],
    ]);
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

  describe('Mode sauvage', () => {
    it('enregistre le prompt comme issue « mode-libre », déjà lancée', async () => {
      depot([issue(1, { state: 'closed' })]);
      gh.issues.getLabel.mockResolvedValue({});
      gh.issues.create.mockResolvedValue({
        data: issue(9, { title: 'Demande libre : Mets le titre en bleu', labels: [{ name: 'mode-libre' }, { name: 'story:en-cours' }], body: '### Demande libre (mode sauvage, hors story)\n\nMets le titre en bleu\n\n<!-- ada:mode-libre -->' }),
      });
      const demande = await service.prompter('jeton', 'poc', '  Mets le titre en bleu ', 'po1');
      const creation = gh.issues.create.mock.calls[0][0];
      expect(creation.title).toBe('Demande libre : Mets le titre en bleu');
      expect(creation.labels).toEqual(['mode-libre', 'story:en-cours']);
      expect(creation.body).toContain('Mets le titre en bleu');
      expect(gh.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 9, body: '▶️ Lancée depuis ADA par po1 (mode sauvage).' }));
      expect(demande).toMatchObject({ numero: 9, type: 'libre', statut: 'en-cours', prete: true });
    });

    it('refuse un prompt si une autre demande est en cours', async () => {
      depot([issue(1, { labels: [{ name: 'user-story' }, { name: 'story:en-cours' }] })]);
      await expect(service.prompter('jeton', 'poc', 'Mets le titre en bleu', 'po1')).rejects.toThrow(/une seule demande à la fois/);
      expect(gh.issues.create).not.toHaveBeenCalled();
    });

    it('refuse un prompt vide', async () => {
      await expect(service.prompter('jeton', 'poc', '   ', 'po1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('refuse un message vide', async () => {
    await expect(service.repondre('jeton', 'poc', 1, '   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.issues.createComment).not.toHaveBeenCalled();
  });

  describe('assigner un développeur à une demande bloquée', () => {
    const bloquee = (assignees: { login: string }[] = []) =>
      issue(7, { labels: [{ name: 'user-story' }, { name: 'story:besoin-dev' }], assignees });

    beforeEach(() => {
      gh.paginate.mockImplementation(async (methode: unknown) =>
        methode === gh.issues.listAssignees ? [{ login: 'dev-b', avatar_url: 'b.png' }, { login: 'dev-a', avatar_url: null }] : [],
      );
      gh.issues.listComments.mockResolvedValue({ data: [] });
    });

    it('propose les personnes qui ont accès au dépôt', async () => {
      expect(await service.developpeurs('jeton', 'poc')).toEqual([
        { login: 'dev-a', avatar: null },
        { login: 'dev-b', avatar: 'b.png' },
      ]);
    });

    it('assigne la personne choisie sur GitHub, et ADA affiche son nom', async () => {
      gh.issues.get.mockResolvedValueOnce({ data: bloquee() }).mockResolvedValueOnce({ data: bloquee([{ login: 'dev-a' }]) });
      const detail = await service.assigner('jeton', 'poc', 7, 'dev-a');
      expect(gh.issues.addAssignees).toHaveBeenCalledWith({ owner: 'proprio', repo: 'poc', issue_number: 7, assignees: ['dev-a'] });
      expect(gh.issues.removeAssignees).not.toHaveBeenCalled();
      expect(detail.assignes).toEqual([{ login: 'dev-a', avatar: null }]);
    });

    it('change d’assignation (l’ancien est retiré) ou la retire', async () => {
      gh.issues.get.mockResolvedValue({ data: bloquee([{ login: 'dev-a' }]) });
      await service.assigner('jeton', 'poc', 7, 'dev-b');
      expect(gh.issues.removeAssignees).toHaveBeenCalledWith(expect.objectContaining({ assignees: ['dev-a'] }));
      expect(gh.issues.addAssignees).toHaveBeenCalledWith(expect.objectContaining({ assignees: ['dev-b'] }));
      vi.clearAllMocks();
      gh.issues.get.mockResolvedValue({ data: bloquee([{ login: 'dev-b' }]) });
      gh.issues.listComments.mockResolvedValue({ data: [] });
      await service.assigner('jeton', 'poc', 7, null);
      expect(gh.issues.removeAssignees).toHaveBeenCalledWith(expect.objectContaining({ assignees: ['dev-b'] }));
      expect(gh.issues.addAssignees).not.toHaveBeenCalled();
    });

    it('refuse une demande qui n’est pas bloquée, ou une personne sans accès au projet', async () => {
      gh.issues.get.mockResolvedValue({ data: issue(7) });
      await expect(service.assigner('jeton', 'poc', 7, 'dev-a')).rejects.toThrow(/seulement à une demande bloquée/);
      gh.issues.get.mockResolvedValue({ data: bloquee() });
      await expect(service.assigner('jeton', 'poc', 7, 'inconnu')).rejects.toThrow(/n’a pas accès au projet/);
      await expect(service.assigner('jeton', 'poc', 7, '../x')).rejects.toThrow(/Choisissez un développeur/);
      expect(gh.issues.addAssignees).not.toHaveBeenCalled();
    });
  });

  describe('découpage validé par le PO (#36)', () => {
    const stories = [
      { titre: 'Voir le matériel', role: 'agent', besoin: 'voir la liste', benefice: 'savoir', criteres: ['Liste'] },
      { titre: 'Emprunter', role: 'agent', besoin: 'emprunter', benefice: 'ne plus utiliser Excel', criteres: ['Bouton Emprunter'] },
      { titre: 'Rendre', role: 'agent', besoin: 'rendre', benefice: 'libérer l’objet', criteres: ['Bouton Rendre'] },
    ];
    const proposition = texteDecoupage('Trop gros.', stories);
    const parent = (labels = [{ name: 'user-story' }, { name: 'story:decoupage-a-valider' }]) =>
      issue(4, { title: 'Tout le prêt de matériel', labels, body: corpsStory(['tout']) });

    beforeEach(() => {
      gh.issues.get.mockResolvedValue({ data: parent() });
      gh.issues.listComments.mockResolvedValue({ data: [{ id: 1, user: { login: 'robot' }, body: `${MARQUEUR_ASSISTANT}\n🤖 **Découpage proposé**\n\n${proposition}`, created_at: '' }] });
      gh.issues.getLabel.mockResolvedValue({});
      let prochain = 10;
      gh.issues.create.mockImplementation(async ({ title, body }: { title: string; body: string }) => ({ data: issue(prochain++, { title, body }) }));
    });

    it('crée à son nom les stories cochées, relues dans la proposition, puis fait de la demande leur parent', async () => {
      const creees = await service.creerDecoupage('jeton', 'poc', 4, [2, 0], 'po1');
      expect(creees.map((story) => [story.numero, story.titre])).toEqual([[10, 'Voir le matériel'], [11, 'Rendre']]);
      const premiere = gh.issues.create.mock.calls[0]![0] as { body: string; labels: string[] };
      expect(premiere.labels).toEqual(['user-story']);
      expect(lireStory(premiere.body)?.criteres).toEqual(['Liste']);
      expect(lireParent(premiere.body)).toBe(4);
      const corpsParent = (gh.issues.update.mock.calls.find((appel) => (appel[0] as { issue_number: number }).issue_number === 4)![0] as { body: string }).body;
      expect(corpsParent).toContain('- [ ] #10 Voir le matériel\n- [ ] #11 Rendre');
      expect(gh.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 4, body: expect.stringContaining('Découpage validé par po1 : #10, #11') }));
      expect(gh.issues.setLabels).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 4, labels: ['user-story', 'story:parent'] }));
    });

    it('refuse une sélection vide ou hors de la proposition, et une demande sans découpage en attente', async () => {
      await expect(service.creerDecoupage('jeton', 'poc', 4, [], 'po1')).rejects.toThrow(/Cochez au moins une story/);
      await expect(service.creerDecoupage('jeton', 'poc', 4, [0, 9], 'po1')).rejects.toThrow(/Cochez au moins une story/);
      gh.issues.get.mockResolvedValue({ data: parent([{ name: 'user-story' }]) });
      await expect(service.creerDecoupage('jeton', 'poc', 4, [0], 'po1')).rejects.toThrow(/Aucun découpage/);
      expect(gh.issues.create).not.toHaveBeenCalled();
    });

    it('story livrée : cochée dans le parent ; le parent se ferme quand toutes le sont', async () => {
      const corpsParent = ajouterDecoupage('Tout', [{ numero: 10, titre: 'Voir' }, { numero: 11, titre: 'Rendre' }]);
      const enfant = (numero: number) => issue(numero, { body: formaterStory(stories[0]!, 4) });
      gh.issues.get.mockImplementation(async ({ issue_number }: { issue_number: number }) => ({ data: issue_number === 4 ? { ...parent([{ name: 'story:parent' }]), body: corpsParent } : enfant(issue_number) }));
      await service.signalerLivraisonAuParent('jeton', 'poc', 10);
      expect((gh.issues.update.mock.calls[0]![0] as { body: string }).body).toContain('- [x] #10 Voir');
      expect(gh.issues.update).not.toHaveBeenCalledWith(expect.objectContaining({ state: 'closed' }));
      gh.issues.update.mockClear();
      const corpsUnLivre = cocherEnfant(corpsParent, 10).corps;
      gh.issues.get.mockImplementation(async ({ issue_number }: { issue_number: number }) => ({ data: issue_number === 4 ? { ...parent([{ name: 'story:parent' }]), body: corpsUnLivre } : enfant(issue_number) }));
      await service.signalerLivraisonAuParent('jeton', 'poc', 11);
      expect(gh.issues.update).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 4, state: 'closed' }));
      expect(gh.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 4, body: '✅ Toutes les stories du découpage sont livrées.' }));
    });

    it('une story sans parent n’est pas concernée', async () => {
      gh.issues.get.mockResolvedValue({ data: issue(12) });
      await service.signalerLivraisonAuParent('jeton', 'poc', 12);
      expect(gh.issues.update).not.toHaveBeenCalled();
    });
  });
});
