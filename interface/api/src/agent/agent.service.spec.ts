import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { lireConfig } from '../config.js';
import type { ApercuService } from '../apercu/apercu.service.js';
import type { GithubService } from '../github/github.service.js';
import type { StoriesService } from '../stories/stories.service.js';
import { AgentService, type LancerAgent } from './agent.service.js';

const JETON = 'jeton-du-po';
const config = (agent = '/bin/agent') =>
  lireConfig({
    GITHUB_PROPRIETAIRE: 'proprio',
    GITHUB_CLIENT_ID: 'Iv',
    GITHUB_CLIENT_SECRET: 's',
    SESSION_SECRET: 'x'.repeat(32),
    AGENT_COMMANDE: agent,
  });

const resultat = (texte: string) => JSON.stringify({ type: 'result', subtype: 'success', result: texte });
const action = (name: string, input: Record<string, unknown>) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

describe('AgentService', () => {
  let racine: string;
  let stories: Record<string, ReturnType<typeof vi.fn>>;
  let apercu: { cheminDepot: ReturnType<typeof vi.fn>; preparerDepot: ReturnType<typeof vi.fn>; executer: ReturnType<typeof vi.fn>; environnementGit: ReturnType<typeof vi.fn> };
  let gh: { pulls: { create: ReturnType<typeof vi.fn> } };
  let service: AgentService;
  let lancer: ReturnType<typeof vi.fn<LancerAgent>>;
  let sortie: string[];
  let statut: string;
  let commits = '1';

  const detail = () => ({
    numero: 1,
    titre: 'Page d’accueil',
    type: 'story',
    statut,
    contenu: { role: 'agent', besoin: 'voir ma journée', benefice: 'm’organiser', criteres: ['titre'] },
    contenuBug: null,
    contenuLibre: null,
    messages: [
      { id: 1, auteur: 'po', texte: 'Discussion avant lancement', le: '' },
      { id: 2, auteur: 'po', texte: '▶️ Lancée depuis ADA par po1.', le: '' },
      { id: 3, auteur: 'po', texte: '<!-- atelier-po:assistant -->\n🤖 **Plan proposé**\n\nJe vais…', le: '' },
      { id: 4, auteur: 'po', texte: 'D’accord', le: '' },
    ],
  });

  beforeEach(() => {
    racine = mkdtempSync(join(tmpdir(), 'agent-'));
    statut = 'en-cours';
    commits = '1';
    stories = {
      detail: vi.fn(async () => detail()),
      commenterAssistant: vi.fn(async () => undefined),
      changerStatut: vi.fn(async (_j: string, _d: string, _n: number, s: string) => {
        statut = s;
      }),
      repondre: vi.fn(async () => ({})),
    };
    apercu = {
      cheminDepot: vi.fn((projet: string) => join(racine, projet, 'depot')),
      preparerDepot: vi.fn(async (_j: string, projet: string) => join(racine, projet, 'depot')),
      environnementGit: vi.fn(() => ({ GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic secret' })),
      executer: vi.fn(async (_c: string, args: string[]) => ({
        stdout: args.includes('rev-list') ? `${commits}\n` : args.includes('status') || args.includes('--list') ? '' : '',
      })),
    };
    gh = { pulls: { create: vi.fn(async () => ({ data: { html_url: 'https://github.com/proprio/poc/pull/2' } })) } };
    service = new AgentService(
      config(),
      { client: () => gh } as unknown as GithubService,
      stories as unknown as StoriesService,
      apercu as unknown as ApercuService,
    );
    sortie = [];
    lancer = vi.fn<LancerAgent>(async (_args, _cwd, surLigne) => {
      sortie.forEach(surLigne);
      return 0;
    });
    service.lancerAgent = lancer;
  });

  it('analyse en lecture seule et publie le plan, qui attend la validation du PO', async () => {
    sortie = [action('Read', { file_path: '/x/AGENTS.md' }), resultat('{"decision":"plan","texte":"Je vais créer la page."}')];
    service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    const args = lancer.mock.calls[0]![0];
    expect(args.slice(args.indexOf('--allowedTools') + 1)).toEqual(['Read', 'Glob', 'Grep']);
    expect(args.join(' ')).not.toContain(JETON);
    expect(args[1]).toContain('[Assistant] 🤖 **Plan proposé**');
    expect(args[1]).not.toContain('Discussion avant lancement');
    expect(stories.commenterAssistant).toHaveBeenCalledWith(JETON, 'poc', 1, 'Plan proposé', 'Je vais créer la page.');
    expect(statut).toBe('plan-a-valider');
    const activite = await service.activite('poc', 1);
    expect(activite.enCours).toBe(false);
    expect(activite.journal.map((j) => j.texte)).toContain('Lit x/AGENTS.md');
  });

  it('reconnaît aussi les lancements faits avant le renommage en ADA', async () => {
    stories.detail.mockResolvedValueOnce({
      ...detail(),
      messages: [
        { id: 1, auteur: 'po', texte: 'Avant', le: '' },
        { id: 2, auteur: 'po', texte: '▶️ Lancée depuis l’atelier PO par po1.', le: '' },
        { id: 3, auteur: 'po', texte: 'Après', le: '' },
      ],
    });
    sortie = [resultat('{"decision":"plan","texte":"Plan."}')];
    service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    const consigne = lancer.mock.calls[0]![0][1]!;
    expect(consigne).toContain('[PO] Après');
    expect(consigne).not.toContain('Avant');
  });

  it('publie les questions de l’assistant quand la story est floue', async () => {
    sortie = [resultat('{"decision":"questions","texte":"1. Quel format de date ?"}')];
    service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    expect(stories.commenterAssistant).toHaveBeenCalledWith(JETON, 'poc', 1, 'Questions de l’assistant', '1. Quel format de date ?');
    expect(statut).toBe('questions');
  });

  it('demande un développeur si la réponse de l’agent est inexploitable', async () => {
    sortie = [resultat('Je ne sais pas')];
    service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    expect(statut).toBe('besoin-dev');
    expect((await service.activite('poc', 1)).erreur).toMatch(/pas réussi à analyser/);
  });

  it('ne lance pas deux tâches en même temps sur un projet', async () => {
    let terminer: ((code: number) => void) | null = null;
    service.lancerAgent = () => new Promise((ok) => (terminer = ok));
    service.analyser(JETON, 'poc', 1);
    expect(() => service.analyser(JETON, 'poc', 2)).toThrow(ConflictException);
    await vi.waitFor(() => expect(terminer).not.toBeNull());
    terminer!(0);
    await service.derniereTache;
  });

  it('refuse de travailler sans agent configuré', () => {
    const sansAgent = new AgentService(config(''), {} as GithubService, stories as unknown as StoriesService, apercu as unknown as ApercuService);
    expect(() => sansAgent.verifierDisponible()).toThrow(BadRequestException);
  });

  it('ne réalise rien tant que le plan n’est pas proposé', async () => {
    statut = 'questions';
    await expect(service.validerPlan(JETON, 'po1', 'poc', 1)).rejects.toBeInstanceOf(ConflictException);
    expect(lancer).not.toHaveBeenCalled();
  });

  it('après validation : réalise sur une branche, pousse avec les droits du PO, ouvre la PR', async () => {
    statut = 'plan-a-valider';
    sortie = [action('Edit', { file_path: '/x/front/src/views/HomeView.vue' }), resultat('{"resultat":"ok","resume":"La page Ma journée est prête."}')];
    await service.validerPlan(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    expect(stories.repondre).toHaveBeenCalledWith(JETON, 'poc', 1, '✅ Plan validé par po1.');
    const outils = lancer.mock.calls[0]![0];
    expect(outils.some((o) => o.includes('push'))).toBe(false);
    expect(apercu.executer).toHaveBeenCalledWith('git', expect.arrayContaining(['checkout', '-b', 'story/1-page-d-accueil', 'origin/main']));
    const push = apercu.executer.mock.calls.find(([, a]) => (a as string[]).includes('push'))!;
    expect((push[1] as string[]).join(' ')).not.toContain(JETON);
    expect(push[2]).toEqual({ env: { GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic secret' } });
    expect(gh.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({ head: 'story/1-page-d-accueil', base: 'main', title: 'feat: Page d’accueil', body: expect.stringContaining('Closes #1') }),
    );
    expect(statut).toBe('en-verification');
    expect((await service.activite('poc', 1)).pullRequest).toBe('https://github.com/proprio/poc/pull/2');
  });

  it('bloque proprement si l’agent n’a rien enregistré, sans pousser', async () => {
    statut = 'plan-a-valider';
    commits = '0';
    sortie = [resultat('{"resultat":"ok","resume":"Fait."}')];
    await service.validerPlan(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    expect(apercu.executer.mock.calls.some(([, a]) => (a as string[]).includes('push'))).toBe(false);
    expect(statut).toBe('besoin-dev');
  });

  it('bloque si l’agent déclare un blocage', async () => {
    statut = 'plan-a-valider';
    sortie = [resultat('{"resultat":"bloque","raison":"Les tests restent rouges"}')];
    await service.validerPlan(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    expect(stories.commenterAssistant).toHaveBeenCalledWith(JETON, 'poc', 1, 'Besoin d’aide', expect.stringContaining('Les tests restent rouges'));
    expect(statut).toBe('besoin-dev');
  });

  it('relance l’assistant sur une demande en cours sans agent actif', async () => {
    statut = 'en-cours';
    sortie = [resultat('{"decision":"plan","texte":"Plan."}')];
    await service.relancer(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    expect(statut).toBe('plan-a-valider');
  });

  it('reprend la réalisation (sans nouvelle analyse) si le plan avait déjà été validé', async () => {
    statut = 'plan-a-valider';
    service.lancerAgent = async () => {
      throw new Error('coupure');
    };
    await service.validerPlan(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    expect((await service.activite('poc', 1)).erreur).toBe('coupure');
    service.lancerAgent = lancer;
    sortie = [resultat('{"resultat":"ok","resume":"Fait."}')];
    await service.relancer(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    const consigne = lancer.mock.calls.at(-1)![0][1]!;
    expect(consigne).toContain('PHASE : RÉALISATION');
    expect(statut).toBe('en-verification');
  });

  it('rétablit les package-lock.json retouchés par npm, mais refuse toute autre modification', async () => {
    statut = 'plan-a-valider';
    let etat = ' M api/package-lock.json\n';
    apercu.executer.mockImplementation(async (_c: string, args: string[]) => ({
      stdout: args.includes('rev-list') ? '1\n' : args.includes('status') ? etat : '',
    }));
    sortie = [resultat('{"resultat":"ok","resume":"Fait."}')];
    await service.validerPlan(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    expect(apercu.executer).toHaveBeenCalledWith('git', expect.arrayContaining(['checkout', '--', 'api/package-lock.json']));
    expect(statut).toBe('en-verification');

    statut = 'plan-a-valider';
    etat = ' M api/package-lock.json\n M front/src/App.vue\n';
    await service.validerPlan(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    expect((await service.activite('poc', 1)).erreur).toMatch(/modifications non enregistrées/);
  });

  it('ne relance pas une demande qui attend le PO', async () => {
    statut = 'plan-a-valider';
    await expect(service.relancer(JETON, 'po1', 'poc', 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('n’affiche pas « en cours » pour une exécution interrompue (redémarrage)', async () => {
    sortie = [resultat('{"decision":"plan","texte":"Plan."}')];
    service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    const autreInstance = new AgentService(config(), {} as GithubService, stories as unknown as StoriesService, apercu as unknown as ApercuService);
    const { writeFile } = await import('node:fs/promises');
    const fichier = join(racine, 'poc', 'agent', '1.json');
    const brut = JSON.parse(await (await import('node:fs/promises')).readFile(fichier, 'utf8'));
    await writeFile(fichier, JSON.stringify({ ...brut, enCours: true }));
    expect((await autreInstance.activite('poc', 1)).enCours).toBe(false);
  });

  it('une réponse du PO relance l’analyse', async () => {
    statut = 'questions';
    sortie = [resultat('{"decision":"plan","texte":"Plan revu."}')];
    await service.reprendreAnalyse(JETON, 'poc', 1, 'En toutes lettres');
    await service.derniereTache;
    expect(stories.repondre).toHaveBeenCalledWith(JETON, 'poc', 1, 'En toutes lettres');
    expect(statut).toBe('plan-a-valider');
  });
});
