import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { lireConfig } from '../config.js';
import type { ApercuService } from '../apercu/apercu.service.js';
import type { GithubService } from '../github/github.service.js';
import type { StoriesService } from '../stories/stories.service.js';
import type { ProjetsService } from '../projets/projets.service.js';
import { FICHIERS_REPRISE } from '../projets/reprise.js';
import { ADA_PAR_DEFAUT } from '../ada/ada-config.js';
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

/** Catalogue minimal pour la reprise (#37) : fichiers communs et ada.json du modèle de référence. */
const catalogueReprise = mkdtempSync(join(tmpdir(), 'agent-catalogue-'));
for (const fichier of [...FICHIERS_REPRISE, 'ada.json']) {
  mkdirSync(join(catalogueReprise, 'vue-node', fichier, '..'), { recursive: true });
  writeFileSync(join(catalogueReprise, 'vue-node', fichier), fichier === 'ada.json' ? JSON.stringify(ADA_PAR_DEFAUT) : `contenu de ${fichier}`);
}
const projets = {
  dossierCatalogue: catalogueReprise,
  modeles: () => ({
    modeles: [
      { id: 'vue-node', type: 'service', libelle: 'Vue 3 + Node.js (Express), avec DSFR', pourQuoi: 'Petite application', disponible: true },
      { id: 'django', type: 'gestion', libelle: 'Python (Django)', pourQuoi: 'Back-office', disponible: false },
    ],
    types: [{ id: 'service', libelle: 'Application en ligne', description: 'Des écrans et des règles' }],
  }),
};

describe('AgentService', () => {
  let racine: string;
  let stories: Record<string, ReturnType<typeof vi.fn>>;
  let apercu: { relancerApplication: ReturnType<typeof vi.fn>; lireConfig: ReturnType<typeof vi.fn>; cheminDepot: ReturnType<typeof vi.fn>; preparerDepot: ReturnType<typeof vi.fn>; executer: ReturnType<typeof vi.fn>; environnementGit: ReturnType<typeof vi.fn> };
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
      lister: vi.fn(async () => [{ numero: 30, titre: 'Service', type: 'story', statut: 'parent', fermeeLe: null, parent: null }, { numero: 31, titre: 'Envoyer les e-mails', type: 'story', fermeeLe: null, parent: 30 }, { numero: 1, titre: 'Moi-même', type: 'story', fermeeLe: null }]),
      commenterAssistant: vi.fn(async () => undefined),
      changerStatut: vi.fn(async (_j: string, _d: string, _n: number, s: string) => {
        statut = s;
      }),
      repondre: vi.fn(async () => ({})),
    };
    apercu = {
      relancerApplication: vi.fn(async () => {}),
      lireConfig: vi.fn(async () => (await import('../ada/ada-config.js')).ADA_PAR_DEFAUT),
      cheminDepot: vi.fn((projet: string) => join(racine, projet, 'depot')),
      preparerDepot: vi.fn(async (_j: string, projet: string) => join(racine, projet, 'depot')),
      environnementGit: vi.fn(() => ({ GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic secret' })),
      executer: vi.fn(async (_c: string, args: string[]) => ({
        stdout: args.includes('rev-list') ? `${commits}\n` : args.includes('rev-parse') ? 'main\n' : '',
      })),
    };
    gh = { pulls: { create: vi.fn(async () => ({ data: { html_url: 'https://github.com/proprio/poc/pull/2' } })) } };
    service = new AgentService(
      config(),
      { client: () => gh } as unknown as GithubService,
      stories as unknown as StoriesService,
      apercu as unknown as ApercuService,
      projets as unknown as ProjetsService,
    );
    sortie = [];
    lancer = vi.fn<LancerAgent>(async (_args, _cwd, surLigne) => {
      sortie.forEach(surLigne);
      return 0;
    });
    service.lancerAgent = lancer;
  });

  it('conseille une stack d’après l’idée du PO, sans aucun outil, parmi les seuls modèles livrés (#68)', async () => {
    sortie = [resultat('{"modele":"vue-node","raison":"Une petite application avec quelques écrans suffit."}')];
    expect(await service.conseillerStack('les agents réservent une salle de réunion, simplement')).toEqual({
      modele: 'vue-node',
      raison: 'Une petite application avec quelques écrans suffit.',
    });
    const args = lancer.mock.calls[0]![0];
    expect(args).not.toContain('--allowedTools');
    expect(args.slice(args.indexOf('--disallowedTools') + 1)).toEqual(expect.arrayContaining(['Bash', 'Read', 'Write', 'WebFetch']));
    const consigne = args[args.indexOf('-p') + 1]!;
    expect(consigne).toContain('les agents réservent une salle de réunion');
    expect(consigne).toContain('- vue-node : Application en ligne');
    expect(consigne).not.toContain('django');
  });

  it('refuse une idée trop courte, et une réponse hors liste d’ADA', async () => {
    await expect(service.conseillerStack('salle')).rejects.toThrow(/une phrase au moins/);
    sortie = [resultat('{"modele":"django","raison":"x"}')];
    await expect(service.conseillerStack('les agents réservent une salle de réunion')).rejects.toThrow(/choisissez-la vous-même/);
  });

  it('analyse en lecture seule et publie le plan, qui attend la validation du PO', async () => {
    sortie = [action('Read', { file_path: '/x/AGENTS.md' }), resultat('{"decision":"plan","texte":"Je vais créer la page."}')];
    await service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    const args = lancer.mock.calls[0]![0];
    expect(args.slice(args.indexOf('--allowedTools') + 1)).toEqual(['Skill', 'Read(./**)', 'Glob(./**)', 'Grep(./**)']);
    expect(args.slice(args.indexOf('--disallowedTools') + 1, args.indexOf('--allowedTools'))).toEqual(['Edit(./.github/**)', 'Write(./.github/**)', 'Edit(./charts/**)', 'Write(./charts/**)']);
    expect(args.join(' ')).not.toContain(JETON);
    expect(args[1]).toContain('[Assistant] 🤖 **Plan proposé**');
    expect(args[1]).not.toContain('Discussion avant lancement');
    expect(args[1]).toContain('- #31 « Envoyer les e-mails » (issue du découpage de #30)');
    expect(args[1]).toContain('- #30 « Service » (demande découpée');
    expect(args[1]).not.toContain('Moi-même');
    expect(stories.commenterAssistant).toHaveBeenCalledWith(JETON, 'poc', 1, 'Plan proposé', 'Je vais créer la page.');
    expect(statut).toBe('plan-a-valider');
    const activite = await service.activite('poc', 1);
    expect(activite.enCours).toBe(false);
    expect(activite.journal.map((j) => j.texte)).toContain('Lit x/AGENTS.md');
  });

  describe('reprise d’un projet existant (#37)', () => {
    const ghReprise = () => {
      const appels = {
        repos: { getContent: vi.fn(async () => Promise.reject(Object.assign(new Error('absent'), { status: 404 }))) },
        pulls: { list: vi.fn(async () => ({ data: [] })), create: vi.fn(async () => ({ data: { html_url: 'https://github.com/un-po/mon-poc/pull/2' } })) },
        git: {
          getRef: vi.fn(async () => ({ data: { object: { sha: 'sha-main' } } })),
          getCommit: vi.fn(async () => ({ data: { tree: { sha: 'arbre-main' } } })),
          createTree: vi.fn(async () => ({ data: { sha: 'arbre' } })),
          createCommit: vi.fn(async () => ({ data: { sha: 'commit' } })),
          createRef: vi.fn(async () => ({})),
        },
        issues: { update: vi.fn(async () => ({})) },
      };
      Object.assign(gh, appels);
      return appels;
    };
    const ameliorations = [
      { titre: 'Tests d’accessibilité', role: 'PO du projet', besoin: 'un test axe par écran', benefice: 'garantir le RGAA', criteres: ['Chaque écran a son test'] },
      { titre: 'Écrire AGENTS.md', role: 'PO du projet', besoin: 'les règles du projet', benefice: 'guider ADA', criteres: ['Commandes décrites'] },
    ];
    const adaAnalyse = { type: 'service', controles: ['cd /app && npm test'], apercu: { image: 'node:24-bookworm', npm: ['.'], principal: 'npx vite --host 0.0.0.0 --port 5173', port: 5173 } };

    it('analyse en lecture seule comme un projet ADA, ouvre la PR avec l’aperçu déduit, et propose les améliorations', async () => {
      const appels = ghReprise();
      sortie = [resultat(JSON.stringify({ decision: 'reprise', texte: 'Projet Vue sans tests d’accessibilité.', stories: ameliorations, ada: adaAnalyse }))];
      await service.analyserReprise(JETON, 'un-po~mon-poc', 7, 'un-po', { modele: null, dsfr: false });
      await service.derniereTache;

      const args = lancer.mock.calls[0]![0];
      expect(args.slice(args.indexOf('--allowedTools') + 1)).toEqual(['Skill', 'Read(./**)', 'Glob(./**)', 'Grep(./**)']);
      expect(args[1]).toContain('Analyse ce projet comme s\'il avait été créé avec ADA');
      expect(args[1]).toContain('n\'utilise PAS le DSFR');
      expect(args[1]).toContain('Le PO n’a pas indiqué de stack');

      const arbre = (appels.git.createTree.mock.calls[0] as unknown as [{ tree: { path: string; content: string }[] }])[0].tree;
      const ada = JSON.parse(arbre.find((fichier) => fichier.path === 'ada.json')!.content) as Record<string, unknown>;
      expect(ada).toMatchObject({ dsfr: false, controles: ['cd /app && npm test'], controlesRequis: ['Titre de PR (Conventional Commits, semver)'], apercu: { principal: 'npx vite --host 0.0.0.0 --port 5173' } });
      expect(appels.pulls.create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'un-po', repo: 'mon-poc', head: 'ada/reprise', body: expect.stringContaining('/issues/7') }));

      const [, , , titre, texte] = stories.commenterAssistant!.mock.calls[0] as string[];
      expect(titre).toBe('Analyse de la reprise');
      expect(texte).toContain('https://github.com/un-po/mon-poc/pull/2');
      expect(texte).toContain('ada:decoupage');
      expect(statut).toBe('decoupage');
    });

    it('aperçu inexploitable : reprend celui de la stack indiquée par le PO', async () => {
      const appels = ghReprise();
      sortie = [resultat(JSON.stringify({ decision: 'reprise', texte: 'Bilan.', stories: ameliorations, ada: { apercu: {} } }))];
      await service.analyserReprise(JETON, 'mon-poc', 7, 'un-po', { modele: 'vue-node', dsfr: true });
      await service.derniereTache;
      expect(lancer.mock.calls[0]![0][1]).toContain('Vue 3 + Node.js (Express)');
      const arbre = (appels.git.createTree.mock.calls[0] as unknown as [{ tree: { path: string; content: string }[] }])[0].tree;
      expect(JSON.parse(arbre.find((fichier) => fichier.path === 'ada.json')!.content)).toMatchObject({ dsfr: true, apercu: { principal: ADA_PAR_DEFAUT.apercu.principal } });
    });

    it('sans aperçu ni stack : pas de PR, un développeur décrit l’aperçu', async () => {
      const appels = ghReprise();
      sortie = [resultat(JSON.stringify({ decision: 'reprise', texte: 'Bilan.', stories: ameliorations }))];
      await service.analyserReprise(JETON, 'mon-poc', 7, 'un-po', { modele: null, dsfr: false });
      await service.derniereTache;
      expect(appels.pulls.create).not.toHaveBeenCalled();
      expect(statut).toBe('besoin-dev');
    });

    it('rien à améliorer : bilan, PR de reprise, et la demande d’analyse est close', async () => {
      const appels = ghReprise();
      sortie = [resultat(JSON.stringify({ decision: 'reprise', texte: 'Projet déjà conforme.', stories: [], ada: adaAnalyse }))];
      await service.analyserReprise(JETON, 'mon-poc', 7, 'un-po', { modele: null, dsfr: false });
      await service.derniereTache;
      expect(appels.pulls.create).toHaveBeenCalled();
      expect(appels.issues.update).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 7, state: 'closed' }));
    });
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
    await service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    const consigne = lancer.mock.calls[0]![0][1]!;
    expect(consigne).toContain('[PO] Après');
    expect(consigne).not.toContain('Avant');
  });

  it('joint à l’agent l’index RGAA officiel lu dans ADA', async () => {
    const { writeFile } = await import('node:fs/promises');
    const index = join(racine, 'rgaa-index.md');
    await writeFile(index, '# RGAA 4.1.2 — les 106 critères\n- **12.7** Lien d’évitement présent ?');
    const avecIndex = new AgentService(
      lireConfig({ GITHUB_PROPRIETAIRE: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32), AGENT_COMMANDE: '/bin/agent', RGAA_INDEX: index }),
      { client: () => gh } as unknown as GithubService,
      stories as unknown as StoriesService,
      apercu as unknown as ApercuService,
      projets as unknown as ProjetsService,
    );
    avecIndex.lancerAgent = lancer;
    sortie = [resultat('{"decision":"plan","texte":"Plan."}')];
    await avecIndex.analyser(JETON, 'poc', 1);
    await avecIndex.derniereTache;
    expect(lancer.mock.calls[0]![0][1]).toContain('**12.7** Lien d’évitement présent ?');
  });

  it('équipe le projet des skills configurées, sans rien laisser à commiter', async () => {
    const { mkdirSync, writeFileSync, readFileSync, lstatSync, readlinkSync, realpathSync, existsSync } = await import('node:fs');
    const catalogue = join(racine, 'catalogue');
    for (const nom of ['dsfr-skill', 'repo-perimetre']) {
      mkdirSync(join(catalogue, nom), { recursive: true });
      writeFileSync(join(catalogue, nom, 'SKILL.md'), `---\nname: ${nom}\n---\n`);
    }
    const projet = join(racine, 'projet');
    mkdirSync(join(projet, '.git', 'info'), { recursive: true });
    writeFileSync(join(projet, '.git', 'info', 'exclude'), '# exclusions locales\n');
    const equipe = new AgentService(
      lireConfig({ GITHUB_PROPRIETAIRE: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32), AGENT_COMMANDE: '/bin/agent', AGENT_SKILLS: `${join(catalogue, 'dsfr-skill')}, ${join(catalogue, 'repo-perimetre')}, ${join(catalogue, 'absente')}, ${join(catalogue, 'adr-new')}` }),
      {} as GithubService,
      stories as unknown as StoriesService,
      apercu as unknown as ApercuService,
      projets as unknown as ProjetsService,
    );
    mkdirSync(join(catalogue, 'adr-new'), { recursive: true });
    writeFileSync(join(catalogue, 'adr-new', 'SKILL.md'), '---\nname: adr-new\nallowed-tools: Read Write\n---\n');
    const attendu = { noms: ['dsfr-skill', 'repo-perimetre'], dossiers: [realpathSync(join(catalogue, 'dsfr-skill')), realpathSync(join(catalogue, 'repo-perimetre'))] };
    expect(await equipe.equiperSkills(projet)).toEqual(attendu);
    expect(await equipe.equiperSkills(projet)).toEqual(attendu);
    expect(existsSync(join(projet, '.claude/skills/adr-new'))).toBe(false);
    for (const racineSkills of ['.claude/skills', '.agents/skills']) {
      const lien = join(projet, racineSkills, 'dsfr-skill');
      expect(lstatSync(lien).isSymbolicLink()).toBe(true);
      expect(readlinkSync(lien)).toBe(join(catalogue, 'dsfr-skill'));
    }
    const exclusions = readFileSync(join(projet, '.git', 'info', 'exclude'), 'utf8');
    expect(exclusions.match(/^\/\.claude\/skills\/$/gm)).toHaveLength(1);
    expect(exclusions).toContain('/.agents/skills/');
  });

  it('publie les questions d’ADA quand la story est floue', async () => {
    sortie = [resultat('{"decision":"questions","texte":"1. Quel format de date ?"}')];
    await service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    expect(stories.commenterAssistant).toHaveBeenCalledWith(JETON, 'poc', 1, 'Questions d’ADA', '1. Quel format de date ?');
    expect(statut).toBe('questions');
  });

  it('met en attente une demande qui n’a rien à construire pour l’instant, au lieu d’un plan vide', async () => {
    sortie = [resultat('{"decision":"attente","texte":"Elle attend le service d’envoi (#40)."}')];
    await service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    expect(stories.commenterAssistant).toHaveBeenCalledWith(JETON, 'poc', 1, 'Demande mise en attente', 'Elle attend le service d’envoi (#40).');
    expect(statut).toBe('attente');
  });

  it('demande un développeur si la réponse de l’agent est inexploitable', async () => {
    sortie = [resultat('Je ne sais pas')];
    await service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    expect(statut).toBe('besoin-dev');
    expect((await service.activite('poc', 1)).erreur).toMatch(/pas réussi à analyser/);
  });

  it('ne lance pas deux tâches en même temps sur un projet', async () => {
    let terminer: ((code: number) => void) | null = null;
    service.lancerAgent = () => new Promise((ok) => (terminer = ok));
    await service.analyser(JETON, 'poc', 1);
    await expect(service.analyser(JETON, 'poc', 2)).rejects.toThrow(ConflictException);
    expect((await service.verrouActif('poc'))?.numero).toBe(1);
    await vi.waitFor(() => expect(terminer).not.toBeNull());
    terminer!(0);
    await service.derniereTache;
    expect(await service.verrouActif('poc')).toBeNull();
  });

  it('deux lancements simultanés : une seule tâche démarre', async () => {
    let terminer: ((code: number) => void) | null = null;
    service.lancerAgent = () => new Promise((ok) => (terminer = ok));
    const resultats = await Promise.allSettled([service.analyser(JETON, 'poc', 1), service.analyser(JETON, 'poc', 2)]);
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultats.filter((r) => r.status === 'rejected' && r.reason instanceof ConflictException)).toHaveLength(1);
    await vi.waitFor(() => expect(terminer).not.toBeNull());
    terminer!(0);
    await service.derniereTache;
  });

  it('ignore le verrou d’un processus mort (exécution interrompue)', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(racine, 'poc', 'agent'), { recursive: true });
    await writeFile(join(racine, 'poc', 'agent', 'verrou.json'), JSON.stringify({ pid: 999999, numero: 1, phase: 'realisation' }));
    expect(await service.verrouActif('poc')).toBeNull();
    sortie = [resultat('{"decision":"plan","texte":"Plan."}')];
    await service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    expect(statut).toBe('plan-a-valider');
  });

  it('refuse de travailler sans agent configuré', () => {
    const sansAgent = new AgentService(config(''), {} as GithubService, stories as unknown as StoriesService, apercu as unknown as ApercuService, projets as unknown as ProjetsService);
    expect(() => sansAgent.verifierDisponible()).toThrow(BadRequestException);
  });

  describe('conversation (« vrai prompt »)', () => {
    const conversation = () => ({
      ...detail(),
      type: 'conversation',
      titre: 'Conversation : mets le titre en bleu',
      statut,
      contenu: null,
      contenuLibre: 'Mets le titre en bleu',
      messages: [{ id: 2, auteur: 'po', texte: '▶️ Lancée depuis ADA par po1 (conversation).', le: '' }],
    });
    beforeEach(() => {
      stories.detail = vi.fn(async () => conversation());
      stories.fermerSansSuite = vi.fn(async () => undefined);
      apercu.executer = vi.fn(async (_c: string, args: string[]) => ({
        stdout: args.includes('rev-list') ? `${commits}\n` : args.includes('branch') ? '  conversation/1-mets-le-titre-en-bleu\n' : args.includes('rev-parse') ? 'main\n' : '',
      }));
    });

    it('agit tout de suite sur sa branche, pousse les commits, relance l’aperçu et répond', async () => {
      sortie = [resultat('{"reponse":"C’est fait : le titre est bleu."}')];
      await service.converser(JETON, 'po1', 'poc', 1);
      await service.derniereTache;
      const args = lancer.mock.calls[0]![0];
      expect(args.slice(args.indexOf('--allowedTools') + 1)).toContain('Edit(./**)');
      expect(args[1]).toContain('PHASE : CONVERSATION');
      expect(args[1]).toContain('Premier message du PO :\nMets le titre en bleu');
      const appels = apercu.executer.mock.calls.map((appel) => (appel[1] as string[]).join(' '));
      expect(appels.some((appel) => appel.startsWith('-C') && appel.includes('checkout --quiet conversation/1-mets-le-titre-en-bleu'))).toBe(true);
      expect(appels.some((appel) => appel.includes('push --quiet -u origin conversation/1-mets-le-titre-en-bleu'))).toBe(true);
      expect(appels.some((appel) => appel.includes('main') && appel.includes('push') && !appel.includes('conversation/'))).toBe(false);
      expect(apercu.relancerApplication).toHaveBeenCalledWith('poc');
      expect(stories.commenterAssistant).toHaveBeenCalledWith(JETON, 'poc', 1, 'ADA', 'C’est fait : le titre est bleu.');
      expect(statut).toBe('echange');
      expect(gh.pulls.create).not.toHaveBeenCalled();
    });

    it('une simple question : réponse sans rien pousser', async () => {
      commits = '0';
      sortie = [resultat('{"reponse":"Le titre est dans l’en-tête."}')];
      await service.converser(JETON, 'po1', 'poc', 1);
      await service.derniereTache;
      const appels = apercu.executer.mock.calls.map((appel) => (appel[1] as string[]).join(' '));
      expect(appels.some((appel) => appel.includes('push'))).toBe(false);
      expect(statut).toBe('echange');
    });

    it('un message du PO relance ADA ; refusé si ADA n’attend rien', async () => {
      statut = 'echange';
      sortie = [resultat('{"reponse":"Voilà."}')];
      await service.reprendreConversation(JETON, 'po1', 'poc', 1, 'plutôt en rouge');
      await service.derniereTache;
      expect(stories.repondre).toHaveBeenCalledWith(JETON, 'poc', 1, 'plutôt en rouge');
      expect(lancer).toHaveBeenCalledTimes(1);
      statut = 'en-cours';
      await expect(service.reprendreConversation(JETON, 'po1', 'poc', 1, 'encore')).rejects.toThrow(/n’attend pas de message/);
      statut = 'echange';
      await expect(service.reprendreConversation(JETON, 'po1', 'poc', 1, '  ')).rejects.toThrow(/Écrivez votre message/);
    });

    it('« c’est bon » : ouvre la PR de la branche, puis la demande passe à vérifier', async () => {
      statut = 'echange';
      expect(await service.terminerConversation(JETON, 'po1', 'poc', 1)).toEqual({ pullRequest: 'https://github.com/proprio/poc/pull/2' });
      expect(gh.pulls.create).toHaveBeenCalledWith(expect.objectContaining({ head: 'conversation/1-mets-le-titre-en-bleu', base: 'main', title: 'feat: mets le titre en bleu' }));
      expect(statut).toBe('en-verification');
    });

    it('« c’est bon » sans aucun changement : la conversation se ferme, sans PR', async () => {
      statut = 'echange';
      commits = '0';
      expect(await service.terminerConversation(JETON, 'po1', 'poc', 1)).toEqual({ pullRequest: null });
      expect(gh.pulls.create).not.toHaveBeenCalled();
      expect(stories.fermerSansSuite).toHaveBeenCalledWith(JETON, 'poc', 1, expect.stringContaining('sans changement'));
    });

    it('arrêter : rien n’est ajouté au projet', async () => {
      statut = 'echange';
      await service.arreterConversation(JETON, 'po1', 'poc', 1);
      expect(stories.fermerSansSuite).toHaveBeenCalledWith(JETON, 'poc', 1, expect.stringContaining('rien n’est ajouté au projet'));
      expect(gh.pulls.create).not.toHaveBeenCalled();
    });
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
    // L'aperçu est relancé sur le travail (API comprise) avant que le PO vérifie.
    expect(apercu.relancerApplication).toHaveBeenCalledWith('poc');
    expect(apercu.relancerApplication.mock.invocationCallOrder[0]).toBeLessThan(
      stories.changerStatut.mock.invocationCallOrder[stories.changerStatut.mock.calls.findIndex((appel) => appel[3] === 'en-verification')]!,
    );
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

  it('relance ADA sur une demande en cours sans agent actif', async () => {
    statut = 'en-cours';
    sortie = [resultat('{"decision":"plan","texte":"Plan."}')];
    await service.relancer(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    expect(statut).toBe('plan-a-valider');
  });

  it('n’envoie rien si un fichier réservé aux développeurs a changé (quel que soit l’outil)', async () => {
    apercu.executer = vi.fn(async (_c: string, args: string[]) => ({
      stdout: args.includes('rev-list') ? '1\n' : args.includes('diff') ? 'src/App.vue\n.github/workflows/ci.yml\n' : args.includes('rev-parse') ? 'main\n' : '',
    }));
    statut = 'plan-a-valider';
    sortie = [resultat('{"resultat":"ok","resume":"Fait."}')];
    await service.validerPlan(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    const appels = apercu.executer.mock.calls.map((appel) => (appel[1] as string[]).join(' '));
    expect(appels.some((appel) => appel.includes('push'))).toBe(false);
    expect(gh.pulls.create).not.toHaveBeenCalled();
    expect(statut).toBe('besoin-dev');
    expect(stories.commenterAssistant).toHaveBeenCalledWith(JETON, 'poc', 1, 'Besoin d’aide', expect.stringContaining('.github/workflows/ci.yml'));
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

  it('reprend le travail non enregistré d’une exécution interrompue sur la même branche', async () => {
    statut = 'en-cours';
    await (await import('node:fs/promises')).mkdir(join(racine, 'poc', 'agent'), { recursive: true });
    await (await import('node:fs/promises')).writeFile(join(racine, 'poc', 'agent', '1.json'), JSON.stringify({ phase: 'realisation', enCours: false, journal: [], erreur: 'coupure', debut: null, pullRequest: null }));
    apercu.executer.mockImplementation(async (_c: string, args: string[]) => ({
      stdout: args.includes('rev-list') ? '1\n' : args.includes('status') ? '?? front/src/__tests__/Barre.spec.ts\n' : args.includes('rev-parse') ? 'story/1-page-d-accueil\n' : '',
    }));
    sortie = [resultat('{"resultat":"ok","resume":"Fait."}')];
    await service.relancer(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    const consigne = lancer.mock.calls.at(-1)![0][1]!;
    expect(consigne).toContain('Reprise : une exécution précédente a été interrompue');
    expect(apercu.executer.mock.calls.some(([, a]) => (a as string[]).includes('-b'))).toBe(false);
    expect(statut).toBe('en-verification');
  });

  it('refuse des modifications non enregistrées sur une autre branche (deux demandes mélangées)', async () => {
    statut = 'plan-a-valider';
    apercu.executer.mockImplementation(async (_c: string, args: string[]) => ({
      stdout: args.includes('status') ? ' M front/src/App.vue\n' : args.includes('rev-parse') ? 'story/9-autre\n' : '',
    }));
    sortie = [resultat('{"resultat":"ok","resume":"Fait."}')];
    await service.validerPlan(JETON, 'po1', 'poc', 1);
    await service.derniereTache;
    expect((await service.activite('poc', 1)).erreur).toMatch(/modifications non enregistrées/);
    expect(lancer).not.toHaveBeenCalled();
  });

  it('ne relance pas une demande qui attend le PO', async () => {
    statut = 'plan-a-valider';
    await expect(service.relancer(JETON, 'po1', 'poc', 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('n’affiche pas « en cours » pour une exécution interrompue (redémarrage)', async () => {
    sortie = [resultat('{"decision":"plan","texte":"Plan."}')];
    await service.analyser(JETON, 'poc', 1);
    await service.derniereTache;
    const autreInstance = new AgentService(config(), {} as GithubService, stories as unknown as StoriesService, apercu as unknown as ApercuService, projets as unknown as ProjetsService);
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
