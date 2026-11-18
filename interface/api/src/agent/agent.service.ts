import { BadRequestException, ConflictException, HttpException, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { appendFile, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { PREFIXE_CONVERSATION, PREFIXE_LIBRE, texteDecoupage, verifierMessage } from '../stories/story.js';
import { ApercuService } from '../apercu/apercu.service.js';
import { EQUIVALENTS, lireUsages, type UsageModele } from '../empreinte/empreinte.js';
import { lireEmpreintes, noterEmpreinte, sommer } from '../empreinte/journal-empreinte.js';
import { CONFIG, type Config } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { DEBUT_LANCEMENT, MARQUEUR_ASSISTANT, StoriesService } from '../stories/stories.service.js';
import {
  brancheDe,
  consigneAnalyse,
  consigneConversation,
  consigneSuiteConversation,
  lireFinConversation,
  cheminsReserves,
  consigneRealisation,
  decrireEvenement,
  lireDecision,
  texteQuestions,
  lireResultat,
  OPTIONS_ISOLEMENT,
  OUTILS_INTERDITS,
  outilsAutorises,
  skillSure,
  type Demande,
  type StoryExistante,
  type Phase,
} from './agent.js';
import { fichiersModifies } from './fichiers-modifies.js';
import { BATTEMENT_VERROU_MS, verrouVivant, type Verrou } from './verrou.js';
import { environnementAgent } from '../apercu/git-isole.js';
import { lireIdentifiant } from '../projets/depot.js';
import { ProjetsService } from '../projets/projets.service.js';
import { adaJsonReprise, corpsReprise, fichiersAApporter, MODELE_REFERENCE, ouvrirPrReprise } from '../projets/reprise.js';
import { consigneReprise, lireAnalyseReprise } from './consigne-reprise.js';
import { consigneConseilStack, lireConseilStack, OUTILS_CONSEIL_INTERDITS, type ConseilStack } from './conseil-stack.js';
import { IDEE_MAX } from '../projets/projet.js';

export interface Activite {
  phase: Phase | null;
  enCours: boolean;
  debut: string | null;
  journal: { le: string; texte: string }[];
  erreur: string | null;
  pullRequest: string | null;
  /** Conversation : session de l'agent, reprise d'un message à l'autre (garder le fil). */
  session?: string | null;
  /**
   * Dernier commit de la branche tel qu'ADA l'a poussé. À la fusion, une branche qui a avancé en
   * dehors d'ADA (des commits ajoutés par quelqu'un d'autre) n'est plus ce que le PO a vérifié.
   */
  tete?: string | null;
}

/** Ce qu'il faut faire, décrit par des données : peut être confié à un processus travailleur. */
export interface Tache {
  phase: Phase;
  jeton: string;
  login: string;
  depot: string;
  numero: number;
  /** Phase « reprise » : stack indiquée par le PO (facultative) et apparence choisie. */
  reprise?: { modele: string | null; dsfr: boolean };
  /** Conversation : le PO a dit « c'est bon » (contrôles complets, puis PR). */
  finaliser?: boolean;
}

/** Écriture atomique : on ne lit jamais un fichier à moitié écrit (fichier temporaire puis renommage). */
async function ecrireAtomique(chemin: string, contenu: string): Promise<void> {
  const temporaire = `${chemin}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaire, contenu);
  await rename(temporaire, chemin);
}

/**
 * Lance le travailleur par un intermédiaire qui se termine aussitôt (« double lancement ») : le
 * travailleur n'est plus un descendant de l'API. Un redémarrage de l'API (mise à jour, mode
 * développement qui arrête tout l'arbre de processus) ne l'interrompt donc pas. Renvoie son pid.
 */
export async function lancerDetache(script: string, fichierTache: string, journal: string): Promise<number> {
  const intermediaire = `
    const { spawn } = require('node:child_process');
    const { openSync } = require('node:fs');
    const sortie = openSync(process.argv[3], 'a');
    const travailleur = spawn(process.execPath, [process.argv[1], process.argv[2]], { detached: true, stdio: ['ignore', sortie, sortie] });
    travailleur.unref();
    process.stdout.write(String(travailleur.pid));`;
  return new Promise((ok, ko) => {
    let pid = '';
    const lanceur = spawn(process.execPath, ['-e', intermediaire, script, fichierTache, journal], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'] });
    lanceur.stdout.on('data', (morceau: Buffer) => (pid += morceau.toString()));
    lanceur.on('error', ko);
    lanceur.on('close', (code) => (code === 0 && Number(pid) > 0 ? ok(Number(pid)) : ko(new Error(`Le travailleur n’a pas pu démarrer (code ${code})`))));
  });
}

/** Lance l'agent ; appelle surLigne pour chaque ligne de sa sortie ; renvoie le code de sortie. */
export type LancerAgent = (args: string[], cwd: string, surLigne: (ligne: string) => void) => Promise<number>;

const lancerParDefaut =
  (commande: string): LancerAgent =>
  (args, cwd, surLigne) =>
    new Promise((ok, ko) => {
      // Sans les secrets du serveur, et avec git verrouillé sur le dépôt de travail (voir git-isole.ts).
      const processus = spawn(commande, args, { cwd, env: environnementAgent(process.env, cwd), stdio: ['ignore', 'pipe', 'pipe'] });
      let reste = '';
      processus.stdout.on('data', (morceau: Buffer) => {
        const lignes = (reste + morceau.toString('utf8')).split('\n');
        reste = lignes.pop() ?? '';
        lignes.filter(Boolean).forEach(surLigne);
      });
      processus.on('error', ko);
      processus.on('close', (code) => {
        if (reste) surLigne(reste);
        ok(code ?? 1);
      });
    });

/** Tâche qui attend qu'un agent se libère (jeton du PO compris : fichier privé). */
interface EntreeFile {
  tache: Tache;
  le: string;
  fichier: string;
}

/** Un garde de reprise plus ancien que cela vient d'un processus tombé en route : on l'écarte. */
const DUREE_MAX_GARDE_MS = 10_000;
const FREQUENCE_FILE_MS = 5_000;
/** Au-delà, la tâche en attente est abandonnée : le jeton du PO aurait expiré. */
const ATTENTE_MAX_MS = 30 * 60_000;
/** Conseils de stack en même temps : chacun lance un agent, sans verrou de projet. */
const CONSEILS_MAX = 3;

const VIDE: Activite = { phase: null, enCours: false, debut: null, journal: [], erreur: null, pullRequest: null };

@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AgentService.name);
  lancerAgent: LancerAgent;
  /**
   * Vrai : chaque tâche tourne dans un processus travailleur détaché, qui survit aux
   * redémarrages de l'API. Faux (tests, et dans le travailleur lui-même) : exécution directe.
   */
  travailleurSepare = !process.env.VITEST;
  /** Dernière tâche de fond lancée (permet aux tests d'en attendre la fin). */
  derniereTache: Promise<void> = Promise.resolve();
  /** Tours maximum de l'agent par phase. */
  tours: Record<Phase, number> = { analyse: 30, realisation: 150, reprise: 40, conversation: 100 };

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly stories: StoriesService,
    private readonly apercu: ApercuService,
    private readonly projets: ProjetsService,
  ) {
    this.lancerAgent = lancerParDefaut(config.AGENT_COMMANDE);
  }

  private indexRgaa: string | null | undefined;
  private conseilsEnCours = 0;

  /** Index RGAA lu une fois ; absent → l'assistant garde les bases (ACCESSIBILITE). */
  private async lireIndexRgaa(): Promise<string | null> {
    if (this.indexRgaa !== undefined) return this.indexRgaa;
    try {
      this.indexRgaa = await readFile(resolve(this.config.RGAA_INDEX), 'utf8');
    } catch {
      this.log.warn(`Index RGAA introuvable (${this.config.RGAA_INDEX}) : l'assistant n'aura que les bases`);
      this.indexRgaa = null;
    }
    return this.indexRgaa;
  }

  /**
   * Relie les skills configurées dans le projet (.claude/skills pour Claude Code, .agents/skills
   * pour les autres agents), exclues localement de git : rien n'est commité, le dépôt reste propre.
   * Renvoie les noms des skills disponibles.
   */
  async equiperSkills(cwd: string): Promise<{ noms: string[]; dossiers: string[] }> {
    const disponibles: string[] = [];
    for (const dossier of this.config.AGENT_SKILLS) {
      const contenu = await readFile(join(dossier, 'SKILL.md'), 'utf8').catch(() => null);
      if (contenu === null) continue;
      if (!skillSure(contenu)) {
        this.log.warn(`Skill ${basename(dossier)} écartée : elle pré-autorise des outils ou exécute des commandes`);
        continue;
      }
      disponibles.push(dossier);
    }
    if (!disponibles.length) return { noms: [], dossiers: [] };
    const exclusion = join(cwd, '.git', 'info', 'exclude');
    const exclus = await readFile(exclusion, 'utf8').catch(() => '');
    const aAjouter = ['/.claude/skills/', '/.agents/skills/'].filter((motif) => !exclus.split('\n').includes(motif));
    if (aAjouter.length) {
      await mkdir(dirname(exclusion), { recursive: true });
      await appendFile(exclusion, `${exclus && !exclus.endsWith('\n') ? '\n' : ''}${aAjouter.join('\n')}\n`);
    }
    for (const racine of ['.claude/skills', '.agents/skills']) {
      await mkdir(join(cwd, racine), { recursive: true });
      for (const dossier of disponibles) {
        const lien = join(cwd, racine, basename(dossier));
        const existant = await lstat(lien).catch(() => null);
        if (!existant) await symlink(resolve(dossier), lien);
      }
    }
    return {
      noms: disponibles.map((dossier) => basename(dossier)),
      // Chemins réels : l'agent lit la skill via le lien, mais la permission porte sur la cible.
      dossiers: await Promise.all(disponibles.map((dossier) => realpath(dossier))),
    };
  }

  private fichier(depot: string, numero: number): string {
    return join(dirname(this.apercu.cheminDepot(depot)), 'agent', `${numero}.json`);
  }

  private async lireActivite(depot: string, numero: number): Promise<Activite> {
    try {
      return JSON.parse(await readFile(this.fichier(depot, numero), 'utf8')) as Activite;
    } catch {
      return { ...VIDE };
    }
  }

  private cheminVerrou(depot: string): string {
    return join(dirname(this.apercu.cheminDepot(depot)), 'agent', 'verrou.json');
  }

  /** Verrou du projet, s'il est tenu par un processus vivant qui bat encore (sinon : reste d'une exécution interrompue). */
  async verrouActif(depot: string): Promise<Verrou | null> {
    return verrouVivant(this.cheminVerrou(depot));
  }

  private async poserVerrou(depot: string, verrou: Verrou): Promise<void> {
    await mkdir(dirname(this.cheminVerrou(depot)), { recursive: true });
    await ecrireAtomique(this.cheminVerrou(depot), JSON.stringify(verrou));
  }

  /**
   * Prise exclusive du verrou du projet : création qui échoue si le fichier existe déjà. Remplacer
   * un verrou abandonné (processus mort, ou sans battement) se fait sous un garde de reprise, créé
   * lui aussi de façon exclusive : un seul processus à la fois y vérifie que le verrou est bien
   * mort, l'efface et prend le sien. Sans ce garde, deux tâches qui le trouvent mort ensemble
   * pourraient l'une effacer le verrou tout neuf de l'autre, et travailler toutes deux sur le projet.
   */
  private async acquerirVerrou(depot: string, verrou: Verrou): Promise<void> {
    const chemin = this.cheminVerrou(depot);
    const garde = `${chemin}.reprise`;
    await mkdir(dirname(chemin), { recursive: true });
    const occupe = () => new ConflictException('ADA travaille déjà sur ce projet');
    for (let essai = 0; essai < 40; essai++) {
      try {
        await writeFile(chemin, JSON.stringify(verrou), { flag: 'wx' });
        return;
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code !== 'EEXIST') throw erreur;
      }
      if (await this.verrouActif(depot)) throw occupe();
      try {
        await writeFile(garde, String(process.pid), { flag: 'wx' });
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code !== 'EEXIST') throw erreur;
        // Une autre reprise est en cours ; si son garde date (processus tombé en route), on le retire.
        const age = Date.now() - (await stat(garde).then((fichier) => fichier.mtimeMs, () => Date.now()));
        if (age > DUREE_MAX_GARDE_MS) await rm(garde, { force: true });
        else await new Promise((ok) => setTimeout(ok, 25));
        continue;
      }
      try {
        if (await this.verrouActif(depot)) throw occupe(); // une autre tâche a repris la main entre-temps
        await rm(chemin, { force: true });
        await writeFile(chemin, JSON.stringify(verrou), { flag: 'wx' });
        return;
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code === 'EEXIST') throw occupe(); // une tâche toute neuve l'a pris
        throw erreur;
      } finally {
        await rm(garde, { force: true });
      }
    }
    throw occupe();
  }

  /**
   * Libre : aucun agent ne tient le projet et aucune tâche n'y attend son tour. À vérifier AVANT
   * d'écrire quoi que ce soit dans GitHub (commentaire, statut) : sinon un refus laisserait l'issue
   * « en cours » sans agent.
   */
  async verifierLibre(depot: string): Promise<void> {
    if ((await this.verrouActif(depot)) || (await this.enFile(depot))) throw new ConflictException('ADA travaille déjà sur ce projet');
  }

  /**
   * Tout ce qui doit être vrai pour lancer ou relancer ADA sur ce projet, vérifié avant la moindre
   * écriture dans GitHub : agent configuré, projet sous son nom actuel, projet libre.
   */
  async verifierLancable(jeton: string, depot: string): Promise<void> {
    this.verifierDisponible();
    await this.verifierNomActuel(jeton, depot);
    await this.verifierLibre(depot);
  }

  /** « En cours » seulement si un agent tourne vraiment (pas un reste d'exécution interrompue). */
  /** Empreinte estimée d'une demande (toutes ses exécutions de l'agent). */
  async empreinteDemande(depot: string, numero: number) {
    const entrees = (await lireEmpreintes(this.config.DOSSIER_REGISTRE)).filter((entree) => entree.projet === depot && entree.numero === numero);
    return entrees.length ? { empreinte: sommer(entrees), equivalents: EQUIVALENTS } : null;
  }

  async activite(depot: string, numero: number): Promise<Activite> {
    const activite = await this.lireActivite(depot, numero);
    const verrou = await this.verrouActif(depot);
    const enCours = activite.enCours && (verrou?.numero === numero || (await this.enFile(depot, numero)));
    return { ...activite, enCours };
  }

  /**
   * Demande en cours ou bloquée sans agent actif. Plan déjà validé (dernière phase : réalisation)
   * → on reprend la réalisation ; sinon → nouvelle analyse.
   */
  async relancer(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    await this.verifierLancable(jeton, depot);
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.statut !== 'en-cours' && detail.statut !== 'besoin-dev') {
      throw new ConflictException('Cette demande n’a pas besoin d’être relancée');
    }
    await this.stories.changerStatut(jeton, depot, numero, 'en-cours');
    const precedente = await this.lireActivite(depot, numero);
    if (precedente.phase === 'conversation') {
      await this.noter(depot, numero, 'Reprend la conversation');
      await this.converser(jeton, login, depot, numero);
    } else if (precedente.phase === 'realisation') {
      await this.noter(depot, numero, 'Reprend la réalisation');
      await this.realiser(jeton, login, depot, numero);
    } else {
      await this.analyser(jeton, depot, numero, login);
    }
  }

  private async enregistrer(depot: string, numero: number, maj: Partial<Activite>): Promise<Activite> {
    const activite = { ...(await this.lireActivite(depot, numero)), ...maj };
    await mkdir(dirname(this.fichier(depot, numero)), { recursive: true });
    await ecrireAtomique(this.fichier(depot, numero), JSON.stringify(activite, null, 2));
    return activite;
  }

  /** Mémorise le commit que ADA vient de pousser (null : ne plus rien comparer). */
  async noterTete(depot: string, numero: number, sha: string | null): Promise<void> {
    await this.enregistrer(depot, numero, { tete: sha });
  }

  private async noterTeteDe(depot: string, numero: number, cwd: string): Promise<void> {
    const { stdout } = await this.apercu.executer('git', ['-C', cwd, 'rev-parse', 'HEAD']);
    await this.noterTete(depot, numero, stdout.trim() || null);
  }

  private async noter(depot: string, numero: number, texte: string): Promise<void> {
    const activite = await this.lireActivite(depot, numero);
    const journal = [...activite.journal, { le: new Date().toISOString(), texte }].slice(-60);
    await this.enregistrer(depot, numero, { journal });
  }

  /** Modèle choisi dans la configuration (AGENT_MODELE) ; sinon celui du compte de l'agent. */
  private optionModele(): string[] {
    return this.config.AGENT_MODELE ? ['--model', this.config.AGENT_MODELE] : [];
  }

  verifierDisponible(): void {
    if (!this.config.AGENT_COMMANDE) {
      throw new BadRequestException('Aucun agent n’est configuré pour cet atelier (AGENT_COMMANDE). Prévenez son administrateur.');
    }
  }

  /** Les autres stories du projet, les plus récentes d'abord : ADA s'en sert pour éviter les doublons. */
  private async existantes(jeton: string, depot: string, numero: number): Promise<StoryExistante[]> {
    const stories = await this.stories.lister(jeton, depot);
    return stories
      // Les titres de ces demandes entrent dans la consigne de l'agent : pas ceux d'un auteur sans droit d'écriture.
      .filter((story) => story.numero !== numero && story.fiable !== false)
      .map((story) => ({
        numero: story.numero,
        titre: story.titre,
        livree: story.fermeeLe !== null,
        parent: story.parent,
        decoupee: story.statut === 'parent',
      }));
  }

  /**
   * La demande telle qu'ADA l'a figée au lancement, et les échanges faits par son interface
   * (journal d'ADA). L'agent ne lit jamais l'issue vivante ni ses commentaires : un titre, un
   * label ou un commentaire écrits à la main sur GitHub ne peuvent pas lui donner de consigne.
   */
  private async demande(jeton: string, depot: string, numero: number): Promise<Demande> {
    const { fige, messages } = await this.stories.demandeFigee(jeton, depot, numero);
    const depart = messages.findIndex((m) => m.texte.startsWith(DEBUT_LANCEMENT));
    const echanges = messages
      .slice(depart + 1)
      .map((m) =>
        m.texte.startsWith(MARQUEUR_ASSISTANT)
          ? { auteur: 'assistant' as const, texte: m.texte.replace(MARQUEUR_ASSISTANT, '').trim() }
          : { auteur: 'po' as const, texte: m.texte.trim() },
      );
    return {
      numero,
      titre: fige.titre,
      type: fige.type,
      contenu: fige.contenu,
      contenuBug: fige.contenuBug,
      contenuLibre: fige.contenuLibre,
      parent: fige.parent,
      echanges,
    };
  }

  /**
   * Conseil de stack à la création (#68) : l'assistant lit l'idée du PO et propose le modèle livré
   * le plus adapté, avec une phrase d'explication. Sans outil, dans un dossier vide et jetable.
   */
  async conseillerStack(idee: unknown): Promise<ConseilStack> {
    if (!this.config.AGENT_COMMANDE) {
      throw new BadRequestException('Aucun agent n’est configuré pour cet atelier (AGENT_COMMANDE). Choisissez la stack vous-même.');
    }
    const texte = typeof idee === 'string' ? idee.trim() : '';
    if (texte.length < 10 || texte.length > IDEE_MAX) {
      throw new BadRequestException('Racontez votre idée (une phrase au moins) pour qu’ADA puisse vous conseiller');
    }
    if (this.conseilsEnCours >= CONSEILS_MAX) {
      throw new HttpException('ADA est très sollicitée en ce moment : réessayez dans un instant, ou choisissez la stack vous-même.', 429);
    }
    const { modeles, types } = this.projets.modeles();
    const disponibles = modeles.filter((modele) => modele.disponible);
    this.conseilsEnCours++;
    let dossier = '';
    let reponse = '';
    try {
      dossier = await mkdtemp(join(tmpdir(), 'ada-conseil-'));
      const args = [
        '-p',
        consigneConseilStack(texte, disponibles, types),
        '--output-format',
        'stream-json',
        '--verbose',
        ...this.optionModele(),
        '--max-turns',
        '2',
        ...OPTIONS_ISOLEMENT,
        '--no-session-persistence',
        '--disallowedTools',
        ...OUTILS_CONSEIL_INTERDITS,
      ];
      await this.lancerAgent(args, dossier, (ligne) => {
        try {
          const evt = JSON.parse(ligne) as { type?: string; result?: string };
          if (evt.type === 'result' && typeof evt.result === 'string') reponse = evt.result;
        } catch {
          /* ligne non JSON : ignorée */
        }
      });
    } catch (e) {
      this.log.warn(`Conseil de stack impossible : ${(e as Error).message}`);
    } finally {
      this.conseilsEnCours--;
      if (dossier) await rm(dossier, { recursive: true, force: true });
    }
    const conseil = lireConseilStack(reponse, disponibles.map((modele) => modele.id));
    if (!conseil) throw new ConflictException('ADA n’a pas pu proposer de stack : choisissez-la vous-même dans la liste.');
    return conseil;
  }

  /** Exécute une phase de l'agent et renvoie sa réponse finale (texte). */
  private async executer(
    depot: string,
    numero: number,
    phase: Phase,
    consigne: string,
    cwd: string,
    dossiersLisibles: string[] = [],
    /** Conversation : session nommée (premier message) ou reprise (messages suivants). */
    session: { id: string; reprendre: boolean } | null = null,
  ): Promise<string> {
    let resultat = '';
    let usages: UsageModele[] = [];
    const args = [
      '-p',
      consigne,
      '--output-format',
      'stream-json',
      '--verbose',
      ...this.optionModele(),
      '--max-turns',
      String(this.tours[phase]),
      ...OPTIONS_ISOLEMENT,
      ...(session ? (session.reprendre ? ['--resume', session.id] : ['--session-id', session.id]) : ['--no-session-persistence']),
      '--disallowedTools',
      ...OUTILS_INTERDITS,
      '--allowedTools',
      ...outilsAutorises(phase, dossiersLisibles),
    ];
    const notes: Promise<void>[] = [];
    const code = await this.lancerAgent(args, cwd, (ligne) => {
      for (const texte of decrireEvenement(ligne)) notes.push(this.noter(depot, numero, texte));
      try {
        const evt = JSON.parse(ligne) as { type?: string; result?: string; modelUsage?: unknown };
        if (evt.type === 'result' && typeof evt.result === 'string') resultat = evt.result;
        if (evt.type === 'result') usages = lireUsages(evt.modelUsage);
      } catch {
        /* ligne non JSON : ignorée */
      }
    });
    await Promise.all(notes);
    // Empreinte carbone : tokens par modèle seulement, jamais de contenu ; une erreur d'écriture
    // ne doit pas faire échouer le travail du PO.
    await noterEmpreinte(this.config.DOSSIER_REGISTRE, { le: new Date().toISOString(), projet: depot, numero, phase, session: session?.id ?? null, usages }).catch((e: unknown) =>
      this.log.warn(`Empreinte de ${depot}#${numero} non notée : ${(e as Error).message}`),
    );
    if (code !== 0 && !resultat) throw new Error(`L’agent s’est arrêté (code ${code})`);
    return resultat;
  }

  /**
   * Un dépôt renommé sur GitHub reste joignable sous son ancien nom (redirection) : ADA, qui range
   * verrou, journal et aperçu sous le nom, y verrait deux projets et pourrait lancer deux agents
   * sur la même story. On refuse donc tout lancement sous un nom périmé.
   */
  private async verifierNomActuel(jeton: string, depot: string): Promise<void> {
    const cible = lireIdentifiant(depot, this.config.GITHUB_PROPRIETAIRE);
    const { data } = await this.github.client(jeton).repos.get({ owner: cible.owner, repo: cible.repo });
    if (data.name.toLowerCase() !== cible.repo.toLowerCase()) {
      throw new ConflictException(
        `Ce projet a été renommé « ${data.name} » sur GitHub. Rouvrez-le sous ce nom dans la liste des projets, puis relancez.`,
      );
    }
  }

  /**
   * Démarre une tâche pour la demande : une seule par projet (verrou partagé entre processus) et
   * au plus AGENT_MAX_SIMULTANES sur toute la machine. Au-delà, la tâche attend son tour dans une
   * file : les agents consomment chacun un conteneur et un processeur, et vingt PO qui lancent
   * ensemble ne doivent pas saturer le serveur.
   */
  private async lancerTache(tache: Tache): Promise<void> {
    this.verifierDisponible();
    await this.verifierNomActuel(tache.jeton, tache.depot);
    await this.serialiser(async () => {
      await this.verifierLibre(tache.depot);
      if ((await this.agentsEnCours()) >= this.config.AGENT_MAX_SIMULTANES) {
        await this.mettreEnFile(tache);
        return;
      }
      await this.demarrerTache(tache);
    });
  }

  /** Une décision à la fois (compter les agents, puis prendre une place) : sinon deux lancements simultanés dépasseraient le plafond. */
  private chaine: Promise<unknown> = Promise.resolve();
  private serialiser<T>(travail: () => Promise<T>): Promise<T> {
    const suite = this.chaine.then(travail, travail);
    this.chaine = suite.catch(() => undefined);
    return suite;
  }

  /** Prend le verrou du projet et lance la tâche ; en cas d'échec, rend le verrou (sinon le projet resterait « occupé »). */
  private async demarrerTache(tache: Tache): Promise<void> {
    await this.acquerirVerrou(tache.depot, { pid: process.pid, numero: tache.numero, phase: tache.phase });
    try {
      // L'agent lance ses commandes dans le conteneur de l'aperçu : s'il dormait, on le réveille.
      this.apercu.noterUtilisation(tache.depot);
      if (this.apercu.estEnVeille(tache.depot)) await this.apercu.demarrer(tache.jeton, tache.depot);
      await this.enregistrer(tache.depot, tache.numero, {
        phase: tache.phase,
        enCours: true,
        debut: new Date().toISOString(),
        erreur: null,
      });
      if (this.travailleurSepare) {
        await this.demarrerTravailleur(tache);
        return;
      }
      this.derniereTache = this.executerTache(tache);
    } catch (e) {
      await rm(this.cheminVerrou(tache.depot), { force: true });
      // L'écran du PO affiche cette erreur avec « Relancer ADA » : l'issue ne reste pas « en cours » sans explication.
      await this.enregistrer(tache.depot, tache.numero, { enCours: false, erreur: (e as Error).message }).catch(() => undefined);
      throw e;
    }
  }

  // ---- File d'attente : tâches qui attendent qu'un agent se libère ----------------------------------------------

  private minuteurFile: ReturnType<typeof setInterval> | null = null;

  onModuleInit(): void {
    if (!this.travailleurSepare) return;
    this.minuteurFile = setInterval(() => void this.traiterFile().catch((e: unknown) => this.log.warn(`File d'attente : ${(e as Error).message}`)), FREQUENCE_FILE_MS);
    this.minuteurFile.unref();
  }

  onModuleDestroy(): void {
    if (this.minuteurFile) clearInterval(this.minuteurFile);
  }

  /** Dossier des tâches en attente, hors de tout projet (le point initial l'écarte des listes de projets). */
  private get dossierFile(): string {
    return join(resolve(this.config.DOSSIER_APERCUS), '.file-attente');
  }

  /** Une seule entrée par projet : son nom l'identifie, et sa création exclusive empêche tout doublon. */
  private fichierFile(depot: string): string {
    return join(this.dossierFile, `${Buffer.from(depot).toString('hex')}.json`);
  }

  private async lireEntreeFile(fichier: string): Promise<EntreeFile | null> {
    try {
      return { ...(JSON.parse(await readFile(fichier, 'utf8')) as Omit<EntreeFile, 'fichier'>), fichier };
    } catch {
      return null;
    }
  }

  /** Des tâches attendent leur tour, dans l'ordre d'arrivée. */
  private async entreesFile(): Promise<EntreeFile[]> {
    const noms = await readdir(this.dossierFile).catch(() => [] as string[]);
    const entrees = await Promise.all(noms.filter((nom) => nom.endsWith('.json')).map((nom) => this.lireEntreeFile(join(this.dossierFile, nom))));
    return entrees.filter((entree): entree is EntreeFile => entree !== null).sort((a, b) => a.le.localeCompare(b.le));
  }

  /** Une tâche de ce projet (et de cette demande, si précisée) attend son tour. */
  async enFile(depot: string, numero?: number): Promise<boolean> {
    const entree = await this.lireEntreeFile(this.fichierFile(depot));
    return entree !== null && (numero === undefined || entree.tache.numero === numero);
  }

  private async agentsEnCours(): Promise<number> {
    return (await this.apercu.projetsAvecAgent()).length;
  }

  private async mettreEnFile(tache: Tache): Promise<void> {
    await mkdir(this.dossierFile, { recursive: true, mode: 0o700 });
    try {
      // La tâche porte le jeton du PO : fichier lisible par le seul utilisateur, supprimé au départ de la tâche.
      await writeFile(this.fichierFile(tache.depot), JSON.stringify({ tache, le: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === 'EEXIST') throw new ConflictException('ADA travaille déjà sur ce projet');
      throw erreur;
    }
    await this.enregistrer(tache.depot, tache.numero, { phase: tache.phase, enCours: true, debut: new Date().toISOString(), erreur: null });
    const devant = (await this.entreesFile()).findIndex((entree) => entree.tache.depot === tache.depot);
    await this.noter(
      tache.depot,
      tache.numero,
      `En file d’attente (${devant + 1}ᵉ) : ADA termine d’abord les demandes d’autres projets, puis s’y met toute seule`,
    );
  }

  /**
   * Démarre, dans l'ordre d'arrivée, les tâches en attente tant qu'il reste de la place. Appelée
   * toutes les quelques secondes par l'API. Une tâche qui attend depuis trop longtemps est
   * abandonnée (son jeton aurait expiré) : l'écran du PO propose alors « Relancer ADA ».
   */
  async traiterFile(maintenant = Date.now()): Promise<void> {
    for (const entree of await this.entreesFile()) {
      const { tache } = entree;
      const suite = await this.serialiser(async (): Promise<'plein' | 'suivante'> => {
        if (await this.verrouActif(tache.depot)) return 'suivante';
        if (maintenant - Date.parse(entree.le) > ATTENTE_MAX_MS) {
          await rm(entree.fichier, { force: true });
          await this.enregistrer(tache.depot, tache.numero, { enCours: false, erreur: 'ADA n’a pas pu s’y mettre à temps : trop de demandes en même temps. Relancez-la.' });
          await this.noter(tache.depot, tache.numero, 'Attente trop longue : à relancer');
          return 'suivante';
        }
        if ((await this.agentsEnCours()) >= this.config.AGENT_MAX_SIMULTANES) return 'plein';
        await rm(entree.fichier, { force: true }); // une tâche part une seule fois
        await this.demarrerTache(tache).catch((e: unknown) => this.log.warn(`Tâche en file ${tache.depot}#${tache.numero} non démarrée : ${(e as Error).message}`));
        return 'suivante';
      });
      if (suite === 'plein') break;
    }
  }

  /**
   * Processus détaché : il survit à un redémarrage de l'API. La tâche (avec le jeton du PO) lui
   * est passée par un fichier lisible par le seul utilisateur, qu'il supprime dès sa lecture.
   */
  private async demarrerTravailleur(tache: Tache): Promise<void> {
    const dossier = dirname(this.cheminVerrou(tache.depot));
    await mkdir(dossier, { recursive: true });
    const fichierTache = join(dossier, `tache-${tache.numero}-${Date.now()}.json`);
    await writeFile(fichierTache, JSON.stringify(tache), { mode: 0o600 });
    const pid = await lancerDetache(join(import.meta.dirname, 'travailleur.js'), fichierTache, join(dossier, `${tache.numero}.travailleur.log`));
    await this.poserVerrou(tache.depot, { pid, numero: tache.numero, phase: tache.phase });
  }


  /** Exécute la tâche dans ce processus (travailleur, ou tests) et tient l'activité à jour. */
  async executerTache(tache: Tache): Promise<void> {
    const { depot, numero, phase } = tache;
    await this.poserVerrou(depot, { pid: process.pid, numero, phase });
    // Signe de vie : un verrou qui ne bat plus est abandonné, même si son numéro de processus existe encore.
    const battement = setInterval(() => {
      const maintenant = new Date();
      void utimes(this.cheminVerrou(depot), maintenant, maintenant).catch(() => undefined);
    }, BATTEMENT_VERROU_MS);
    battement.unref();
    try {
      if (phase === 'analyse') await this.corpsAnalyse(tache);
      else if (phase === 'reprise') await this.corpsReprise(tache);
      else if (phase === 'conversation') await this.corpsConversation(tache);
      else await this.corpsRealisation(tache);
      await this.enregistrer(depot, numero, { enCours: false });
    } catch (e) {
      const message = (e as Error).message;
      this.log.warn(`Agent sur ${depot}#${numero} (${phase}) : ${message}`);
      await this.enregistrer(depot, numero, { enCours: false, erreur: message });
    } finally {
      clearInterval(battement);
      await rm(this.cheminVerrou(depot), { force: true });
    }
  }

  /** Analyse : questions ou plan, publiés dans l'issue ; aucune modification du code. */
  analyser(jeton: string, depot: string, numero: number, login = ''): Promise<void> {
    return this.lancerTache({ phase: 'analyse', jeton, login, depot, numero });
  }

  private async corpsAnalyse({ jeton, depot, numero }: Tache): Promise<void> {
    {
      await this.noter(depot, numero, 'Prépare le projet');
      const cwd = await this.apercu.preparerDepot(jeton, depot);
      const skills = await this.equiperSkills(cwd);
      await this.noter(depot, numero, 'Lit la story et le projet');
      const { dsfr } = await this.apercu.lireConfig(cwd);
      const demande = { ...(await this.demande(jeton, depot, numero)), existantes: await this.existantes(jeton, depot, numero) };
      const consigne = consigneAnalyse(demande, await this.lireIndexRgaa(), skills.noms, dsfr);
      const reponse = await this.executer(depot, numero, 'analyse', consigne, cwd, skills.dossiers);
      const decision = lireDecision(reponse);
      if (!decision) {
        await this.bloquer(jeton, depot, numero, 'ADA n’a pas réussi à analyser la demande.');
        return;
      }
      if (decision.decision === 'decoupage') {
        await this.stories.commenterAssistant(jeton, depot, numero, 'Découpage proposé', texteDecoupage(decision.texte, decision.stories ?? []));
        await this.stories.changerStatut(jeton, depot, numero, 'decoupage');
        await this.noter(depot, numero, 'Attend que vous choisissiez les stories à créer');
        return;
      }
      if (decision.decision === 'attente') {
        await this.stories.commenterAssistant(jeton, depot, numero, 'Demande mise en attente', decision.texte);
        await this.stories.changerStatut(jeton, depot, numero, 'attente');
        await this.noter(depot, numero, 'En attente : à relancer quand ce qu’elle attend sera livré');
        return;
      }
      const questions = decision.decision === 'questions';
      await this.stories.commenterAssistant(jeton, depot, numero, questions ? 'Questions d’ADA' : 'Plan proposé', texteQuestions(decision));
      await this.stories.changerStatut(jeton, depot, numero, questions ? 'questions' : 'plan-a-valider');
      await this.noter(depot, numero, questions ? 'Attend vos réponses' : 'Attend que vous validiez le plan');
    }
  }

  /**
   * Reprise d'un projet existant (#37) : l'assistant analyse le projet comme s'il avait été créé
   * avec ADA, puis ADA ouvre la PR de reprise (ada.json déduit) et propose les améliorations.
   */
  analyserReprise(jeton: string, depot: string, numero: number, login: string, reprise: { modele: string | null; dsfr: boolean }): Promise<void> {
    return this.lancerTache({ phase: 'reprise', jeton, login, depot, numero, reprise });
  }

  private async corpsReprise({ jeton, login, depot, numero, reprise }: Tache): Promise<void> {
    const { modele = null, dsfr = false } = reprise ?? {};
    const stack = modele ? this.projets.modeles().modeles.find((m) => m.id === modele && m.disponible) : undefined;
    const dossierModele = join(this.projets.dossierCatalogue, stack?.id ?? MODELE_REFERENCE);
    const adaModele = stack ? await readFile(join(dossierModele, 'ada.json'), 'utf8') : null;

    await this.noter(depot, numero, 'Prépare le projet');
    const cwd = await this.apercu.preparerDepot(jeton, depot);
    const skills = await this.equiperSkills(cwd);
    await this.noter(depot, numero, 'Compare le projet à un projet créé avec ADA');
    const consigne = consigneReprise({ stack: stack && adaModele ? { libelle: stack.libelle, ada: adaModele } : null, dsfr }, skills.noms);
    const analyse = lireAnalyseReprise(await this.executer(depot, numero, 'reprise', consigne, cwd, skills.dossiers));
    if (!analyse) {
      await this.bloquer(jeton, depot, numero, 'ADA n’a pas réussi à analyser le projet.');
      return;
    }

    // Aperçu : celui déduit par l'analyse ; à défaut, celui de la stack indiquée par le PO.
    let adaJson: string | null = null;
    for (const source of [analyse.ada, adaModele]) {
      if (adaJson || !source) continue;
      try {
        adaJson = adaJsonReprise(source, dsfr);
      } catch (e) {
        this.log.warn(`ada.json de reprise écarté (${depot}) : ${(e as Error).message.split('\n')[0]}`);
      }
    }
    if (!adaJson) {
      await this.stories.commenterAssistant(jeton, depot, numero, 'Analyse de la reprise', analyse.texte);
      await this.bloquer(jeton, depot, numero, 'ADA n’a pas trouvé comment démarrer l’aperçu du projet : un développeur doit le décrire (ada.json).');
      return;
    }

    await this.noter(depot, numero, 'Ouvre la pull request de reprise');
    const { owner, repo } = lireIdentifiant(depot, this.config.GITHUB_PROPRIETAIRE);
    const gh = this.github.client(jeton);
    const fichiers = await fichiersAApporter(gh, owner, repo, dossierModele, adaJson);
    const analyseUrl = `https://github.com/${owner}/${repo}/issues/${numero}`;
    const pr = await ouvrirPrReprise(gh, { owner, repo, login }, fichiers, corpsReprise({ stack: stack?.libelle ?? null, fichiers: [...fichiers.keys()], login, dsfr, analyse: analyseUrl }));
    const suite = `**Pull request de reprise** : ${pr}\nFusionnez-la sur GitHub : le projet apparaîtra alors dans ADA.`;

    if (analyse.stories.length) {
      await this.stories.commenterAssistant(jeton, depot, numero, 'Analyse de la reprise', texteDecoupage(`${analyse.texte}\n\n${suite}`, analyse.stories));
      await this.stories.changerStatut(jeton, depot, numero, 'decoupage');
      await this.noter(depot, numero, 'Terminé : fusionnez la reprise, puis choisissez les améliorations');
      return;
    }
    await this.stories.commenterAssistant(jeton, depot, numero, 'Analyse de la reprise', `${analyse.texte}\n\nAucune amélioration à proposer.\n\n${suite}`);
    await gh.issues.update({ owner, repo, issue_number: numero, state: 'closed', state_reason: 'completed' });
    await this.noter(depot, numero, 'Terminé : fusionnez la reprise');
  }

  /** Le PO valide le plan : réalisation sur une branche, puis branche poussée et PR ouverte. */
  async validerPlan(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    await this.verifierLancable(jeton, depot);
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.statut !== 'plan-a-valider') throw new ConflictException('Aucun plan n’attend votre validation');
    await this.stories.repondre(jeton, depot, numero, `✅ Plan validé par ${login}.`);
    await this.stories.changerStatut(jeton, depot, numero, 'en-cours');
    await this.realiser(jeton, login, depot, numero);
  }

  private realiser(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    return this.lancerTache({ phase: 'realisation', jeton, login, depot, numero });
  }

  private async corpsRealisation({ jeton, login, depot, numero }: Tache): Promise<void> {
    {
      const demande = await this.demande(jeton, depot, numero);
      const branche = brancheDe(demande);
      const { cwd, travailRepris } = await this.preparerBranche(jeton, login, depot, branche);
      const skills = await this.equiperSkills(cwd);
      await this.noter(depot, numero, travailRepris ? `Reprend le travail interrompu sur ${branche}` : `Travaille sur la branche ${branche}`);
      const reprise = travailRepris
        ? '\n\nReprise : une exécution précédente a été interrompue. Les fichiers modifiés ou non suivis de la branche (git status) sont ce travail en cours : vérifie-les et continue, sans repartir de zéro.'
        : '';
      const { controles, dsfr } = await this.apercu.lireConfig(cwd);
      const consigne = consigneRealisation(demande, branche, await this.lireIndexRgaa(), skills.noms, controles, dsfr) + reprise;
      const reponse = await this.executer(depot, numero, 'realisation', consigne, cwd, skills.dossiers);
      const resultat = lireResultat(reponse);
      if (!resultat || resultat.resultat === 'bloque') {
        await this.bloquer(jeton, depot, numero, resultat?.resultat === 'bloque' ? resultat.raison : 'ADA n’a pas terminé la réalisation.');
        return;
      }
      const { stdout: nbCommits } = await this.apercu.executer('git', ['-C', cwd, 'rev-list', '--count', `origin/main..${branche}`]);
      if (Number(nbCommits.trim()) === 0) {
        await this.bloquer(jeton, depot, numero, 'ADA n’a enregistré aucune modification.');
        return;
      }
      if (await this.toucheDossiersReserves(jeton, depot, numero, cwd, branche)) return;
      await this.noter(depot, numero, 'Envoie la branche sur GitHub');
      await this.apercu.executer('git', ['-C', cwd, 'push', '--quiet', '-u', 'origin', branche], { env: this.apercu.environnementGit(jeton) });
      await this.noterTeteDe(depot, numero, cwd);
      const pr = await this.ouvrirPullRequest(jeton, depot, cwd, branche, demande, resultat.resume);
      await this.enregistrer(depot, numero, { pullRequest: pr });
      await this.stories.commenterAssistant(
        jeton,
        depot,
        numero,
        'Réalisation terminée',
        `${resultat.resume}\n\nLes contrôles automatiques tournent sur la pull request : ${pr}`,
      );
      // L'aperçu doit montrer ce travail, API comprise, pour que le PO vérifie le vrai résultat.
      await this.noter(depot, numero, 'Relance l’aperçu');
      await this.apercu.relancerApplication(depot).catch((e: unknown) => this.log.warn(`Relance de l’aperçu de ${depot} : ${(e as Error).message.split('\n')[0]}`));
      await this.stories.changerStatut(jeton, depot, numero, 'en-verification');
      await this.noter(depot, numero, 'Terminé : à vous de vérifier');
    }
  }

  /** Conversation : ADA répond au dernier message du PO, en agissant tout de suite sur sa branche. */
  converser(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    return this.lancerTache({ phase: 'conversation', jeton, login, depot, numero });
  }

  private async corpsConversation({ jeton, login, depot, numero, finaliser = false }: Tache): Promise<void> {
    const demande = await this.demande(jeton, depot, numero);
    const branche = brancheDe(demande);
    const { cwd } = await this.preparerBranche(jeton, login, depot, branche);
    const skills = await this.equiperSkills(cwd);
    await this.noter(depot, numero, finaliser ? 'Lance les contrôles complets avant de proposer vos changements' : `Lit votre message (branche ${branche})`);
    const { controles, dsfr } = await this.apercu.lireConfig(cwd);
    const consigneComplete = () => consigneConversation(demande, branche, this.indexRgaa ?? null, skills.noms, controles, dsfr, finaliser);
    const executerConversation = async (consigne: string, session: { id: string; reprendre: boolean }) =>
      lireFinConversation(await this.executer(depot, numero, 'conversation', consigne, cwd, skills.dossiers, session));

    // Garder le fil : la session de l'agent est reprise d'un message à l'autre (il a déjà les règles
    // et l'historique) ; sans session, ou si elle ne se reprend plus, on repart de la consigne complète.
    await this.lireIndexRgaa();
    const precedente = (await this.lireActivite(depot, numero)).session ?? null;
    const dernierMessage = [...demande.echanges].reverse().find((echange) => echange.auteur === 'po')?.texte;
    let fin: { reponse: string; pret: boolean } | null = null;
    if (precedente && dernierMessage) {
      fin = await executerConversation(consigneSuiteConversation(dernierMessage, controles, finaliser), { id: precedente, reprendre: true }).catch((e: unknown) => {
        this.log.warn(`Reprise de la session de ${depot}#${numero} impossible : ${(e as Error).message}`);
        return null;
      });
    }
    if (!fin) {
      const session = randomUUID();
      await this.enregistrer(depot, numero, { session });
      fin = await executerConversation(consigneComplete(), { id: session, reprendre: false });
    }
    if (!fin) {
      await this.bloquer(jeton, depot, numero, 'ADA n’a pas réussi à répondre à votre message.');
      return;
    }
    // Des commits pas encore sur GitHub : on pousse la branche (jamais main) et l'aperçu les montre.
    const { stdout: nouveaux } = await this.apercu.executer('git', ['-C', cwd, 'rev-list', '--count', branche, '--not', '--remotes=origin']);
    if (Number(nouveaux.trim()) > 0) {
      if (await this.toucheDossiersReserves(jeton, depot, numero, cwd, branche)) return;
      await this.noter(depot, numero, 'Envoie la branche sur GitHub');
      await this.apercu.executer('git', ['-C', cwd, 'push', '--quiet', '-u', 'origin', branche], { env: this.apercu.environnementGit(jeton) });
      await this.noterTeteDe(depot, numero, cwd);
      await this.noter(depot, numero, 'Relance l’aperçu');
      await this.apercu.relancerApplication(depot).catch((e: unknown) => this.log.warn(`Relance de l’aperçu de ${depot} : ${(e as Error).message.split('\n')[0]}`));
    }
    if (!finaliser) {
      await this.stories.commenterAssistant(jeton, depot, numero, 'ADA', fin.reponse);
      await this.stories.changerStatut(jeton, depot, numero, 'echange');
      await this.noter(depot, numero, 'À vous : répondez à ADA');
      return;
    }
    await this.proposerChangements(jeton, login, depot, numero, cwd, branche, demande, fin);
  }

  /**
   * Fin de conversation (« c'est bon ») : contrôles complets passés → PR (circuit habituel :
   * vérification et fusion par le PO) ; aucun changement → conversation close ; contrôle en échec →
   * ADA le dit et la conversation reste ouverte.
   */
  private async proposerChangements(
    jeton: string,
    login: string,
    depot: string,
    numero: number,
    cwd: string,
    branche: string,
    demande: Demande,
    fin: { reponse: string; pret: boolean },
  ): Promise<void> {
    if (!fin.pret) {
      await this.stories.commenterAssistant(jeton, depot, numero, 'Pas encore prêt', `${fin.reponse}\n\nDites-moi comment continuer, ou demandez l’aide d’un développeur.`);
      await this.stories.changerStatut(jeton, depot, numero, 'echange');
      await this.noter(depot, numero, 'Un contrôle ne passe pas : à vous');
      return;
    }
    const { stdout: nombre } = await this.apercu.executer('git', ['-C', cwd, 'rev-list', '--count', `origin/main..${branche}`]);
    if (Number(nombre.trim()) === 0) {
      await this.stories.fermerSansSuite(jeton, depot, numero, `💬 Conversation terminée par ${login}, sans changement à proposer au projet.`);
      return;
    }
    const pr = await this.ouvrirPullRequest(jeton, depot, cwd, branche, demande, fin.reponse);
    await this.enregistrer(depot, numero, { pullRequest: pr });
    await this.stories.commenterAssistant(
      jeton,
      depot,
      numero,
      'Changements proposés au projet',
      `${fin.reponse}\n\nLes contrôles automatiques tournent sur la pull request : ${pr}`,
    );
    await this.stories.changerStatut(jeton, depot, numero, 'en-verification');
    await this.noter(depot, numero, 'Terminé : à vous de vérifier');
  }

  /** Le PO écrit dans la conversation : ADA reprend la main. */
  async reprendreConversation(jeton: string, login: string, depot: string, numero: number, texte: unknown): Promise<void> {
    await this.verifierLancable(jeton, depot);
    const verification = verifierMessage(texte, false);
    if (!verification.ok) throw new BadRequestException(verification.erreur);
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.type !== 'conversation' || detail.statut !== 'echange') throw new ConflictException('ADA n’attend pas de message dans cette conversation');
    await this.stories.repondre(jeton, depot, numero, verification.texte);
    await this.stories.changerStatut(jeton, depot, numero, 'en-cours');
    await this.converser(jeton, login, depot, numero);
  }

  /**
   * « C'est bon » : ADA lance les contrôles complets (une seule fois), puis propose les changements
   * au projet (PR), ou ferme la conversation s'il n'y en a aucun. Tâche de l'agent, en arrière-plan.
   */
  async terminerConversation(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    await this.verifierLancable(jeton, depot);
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.type !== 'conversation' || detail.statut !== 'echange') throw new ConflictException('Cette conversation ne peut pas être terminée maintenant');
    await this.stories.repondre(jeton, depot, numero, `✅ C’est bon : ${login} demande de proposer ces changements au projet.`);
    await this.stories.changerStatut(jeton, depot, numero, 'en-cours');
    await this.lancerTache({ phase: 'conversation', jeton, login, depot, numero, finaliser: true });
  }

  /** Le PO arrête la conversation : rien n'arrive sur le projet (la branche reste sur GitHub). */
  async arreterConversation(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    if ((await this.verrouActif(depot)) || (await this.enFile(depot))) throw new ConflictException('ADA travaille encore : attendez sa réponse');
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.type !== 'conversation' || detail.statut === 'livree') throw new ConflictException('Cette conversation est déjà terminée');
    await this.stories.fermerSansSuite(jeton, depot, numero, `💬 Conversation arrêtée par ${login} : rien n’est ajouté au projet.`);
  }

  /** Le PO demande de revoir le plan, ou répond aux questions : nouvelle analyse. */
  async reprendreAnalyse(jeton: string, depot: string, numero: number, texte: string): Promise<void> {
    await this.verifierLancable(jeton, depot);
    const detail = await this.stories.detail(jeton, depot, numero);
    // Un autre découpage peut aussi être demandé (#36).
    if (detail.statut !== 'questions' && detail.statut !== 'plan-a-valider' && detail.statut !== 'decoupage') {
      throw new ConflictException('ADA n’attend pas de réponse sur cette demande');
    }
    await this.stories.repondre(jeton, depot, numero, texte);
    await this.stories.changerStatut(jeton, depot, numero, 'en-cours');
    await this.analyser(jeton, depot, numero);
  }

  /**
   * Met le dépôt de l'aperçu sur la branche de la demande. Déjà sur cette branche avec des
   * modifications non enregistrées : c'est le travail d'une exécution interrompue de la même
   * demande, on le garde pour que l'assistant le reprenne. Sur une autre branche, on refuse :
   * on mélangerait deux demandes.
   */
  private async preparerBranche(
    jeton: string,
    login: string,
    depot: string,
    branche: string,
  ): Promise<{ cwd: string; travailRepris: boolean }> {
    const cwd = await this.apercu.preparerDepot(jeton, depot);
    const git = (...args: string[]) => this.apercu.executer('git', ['-C', cwd, ...args]);
    await git('config', 'user.name', login);
    await git('config', 'user.email', `${login}@users.noreply.github.com`);
    const { stdout: etat } = await git('status', '--porcelain');
    const modifies = etat
      .split('\n')
      .map((ligne) => ligne.slice(3).trim())
      .filter(Boolean);
    // npm install (au démarrage de l'aperçu) retouche parfois les package-lock.json : on les rétablit.
    const verrous = modifies.filter((fichier) => fichier.endsWith('package-lock.json'));
    if (verrous.length) await git('checkout', '--', ...verrous);
    const autres = modifies.length - verrous.length;
    const { stdout: courante } = await git('rev-parse', '--abbrev-ref', 'HEAD');
    if (autres > 0) {
      if (courante.trim() === branche) return { cwd, travailRepris: true };
      throw new Error('Le dépôt de l’aperçu contient des modifications non enregistrées');
    }
    const { stdout: existantes } = await git('branch', '--list', branche);
    if (existantes.trim()) await git('checkout', '--quiet', branche);
    else await git('checkout', '--quiet', '-b', branche, 'origin/main');
    return { cwd, travailRepris: false };
  }

  private async ouvrirPullRequest(
    jeton: string,
    depot: string,
    cwd: string,
    branche: string,
    demande: Demande,
    resume: string,
  ): Promise<string> {
    let fiche = '';
    try {
      fiche = await readFile(join(cwd, 'revues', `${branche.replace('/', '-')}.md`), 'utf8');
    } catch {
      /* pas de fiche : le résumé suffit */
    }
    const { data } = await this.github.client(jeton).pulls.create({
      ...lireIdentifiant(depot, this.config.GITHUB_PROPRIETAIRE),
      head: branche,
      base: 'main',
      // Mode libre : sans le préfixe « Demande libre : », pour des notes de version lisibles.
      title: `${demande.type === 'bug' ? 'fix' : 'feat'}: ${demande.titre.replace(PREFIXE_LIBRE, '').replace(PREFIXE_CONVERSATION, '')}`,
      body: `${resume}\n\nCloses #${demande.numero}\n\n${fiche}`.trim(),
    });
    return data.html_url;
  }

  /**
   * Garde-fou avant tout envoi : aucun fichier de .github/ ni de charts/ ne doit changer, quel que
   * soit l'outil utilisé (les interdits de l'agent ne couvrent que l'édition directe).
   */
  private async toucheDossiersReserves(jeton: string, depot: string, numero: number, cwd: string, branche: string): Promise<boolean> {
    const reserves = cheminsReserves(await fichiersModifies(this.apercu.executer, cwd, branche));
    if (!reserves.length) return false;
    await this.bloquer(
      jeton,
      depot,
      numero,
      `J'ai modifié des fichiers réservés aux développeurs (${reserves.join(', ')}). Je n'envoie rien : un développeur doit vérifier.`,
    );
    return true;
  }

  private async bloquer(jeton: string, depot: string, numero: number, raison: string): Promise<void> {
    // La raison d'abord, en local : si GitHub refuse l'écriture (jeton expiré, coupure), l'écran du
    // PO l'affiche quand même, avec « Relancer ADA », au lieu d'un « en cours » muet.
    await this.enregistrer(depot, numero, { erreur: raison });
    try {
      await this.stories.commenterAssistant(jeton, depot, numero, 'Besoin d’aide', `${raison}\n\nUn développeur doit regarder cette demande.`);
      await this.stories.changerStatut(jeton, depot, numero, 'besoin-dev');
    } catch (e) {
      this.log.warn(`Blocage de ${depot}#${numero} non écrit dans GitHub : ${(e as Error).message}`);
    }
    await this.noter(depot, numero, 'Bloqué : un développeur doit intervenir');
  }
}
