import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { PREFIXE_CONVERSATION, PREFIXE_LIBRE, texteDecoupage, verifierMessage } from '../stories/story.js';
import { ApercuService } from '../apercu/apercu.service.js';
import { CONFIG, type Config } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { DEBUT_LANCEMENT, MARQUEUR_ASSISTANT, StoriesService } from '../stories/stories.service.js';
import {
  brancheDe,
  consigneAnalyse,
  consigneConversation,
  lireReponseConversation,
  consigneRealisation,
  decrireEvenement,
  lireDecision,
  texteQuestions,
  lireResultat,
  OUTILS_INTERDITS,
  outilsAutorises,
  skillSure,
  type Demande,
  type StoryExistante,
  type Phase,
} from './agent.js';
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
}

interface Verrou {
  pid: number;
  numero: number;
  phase: Phase;
}

/** Écriture atomique : on ne lit jamais un fichier à moitié écrit (fichier temporaire puis renommage). */
async function ecrireAtomique(chemin: string, contenu: string): Promise<void> {
  const temporaire = `${chemin}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaire, contenu);
  await rename(temporaire, chemin);
}

const processusVivant = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

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
      const processus = spawn(commande, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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

const VIDE: Activite = { phase: null, enCours: false, debut: null, journal: [], erreur: null, pullRequest: null };

@Injectable()
export class AgentService {
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

  /** Verrou du projet, s'il est tenu par un processus vivant (sinon : reste d'une exécution interrompue). */
  async verrouActif(depot: string): Promise<Verrou | null> {
    try {
      const verrou = JSON.parse(await readFile(this.cheminVerrou(depot), 'utf8')) as Verrou;
      return processusVivant(verrou.pid) ? verrou : null;
    } catch {
      return null;
    }
  }

  private async poserVerrou(depot: string, verrou: Verrou): Promise<void> {
    await mkdir(dirname(this.cheminVerrou(depot)), { recursive: true });
    await ecrireAtomique(this.cheminVerrou(depot), JSON.stringify(verrou));
  }

  /**
   * Prise exclusive du verrou du projet : création qui échoue si le fichier existe déjà ; seul un
   * verrou tenu par un processus mort peut être repris. Deux tâches ne peuvent pas démarrer ensemble.
   */
  private async acquerirVerrou(depot: string, verrou: Verrou): Promise<void> {
    await mkdir(dirname(this.cheminVerrou(depot)), { recursive: true });
    try {
      await writeFile(this.cheminVerrou(depot), JSON.stringify(verrou), { flag: 'wx' });
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code !== 'EEXIST') throw erreur;
      if (await this.verrouActif(depot)) throw new ConflictException('ADA travaille déjà sur ce projet');
      await this.poserVerrou(depot, verrou);
    }
  }

  /** « En cours » seulement si un agent tourne vraiment (pas un reste d'exécution interrompue). */
  async activite(depot: string, numero: number): Promise<Activite> {
    const activite = await this.lireActivite(depot, numero);
    const verrou = await this.verrouActif(depot);
    return { ...activite, enCours: activite.enCours && verrou?.numero === numero };
  }

  /**
   * Demande en cours ou bloquée sans agent actif. Plan déjà validé (dernière phase : réalisation)
   * → on reprend la réalisation ; sinon → nouvelle analyse.
   */
  async relancer(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    this.verifierDisponible();
    if (await this.verrouActif(depot)) throw new ConflictException('ADA travaille déjà sur ce projet');
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

  private async noter(depot: string, numero: number, texte: string): Promise<void> {
    const activite = await this.lireActivite(depot, numero);
    const journal = [...activite.journal, { le: new Date().toISOString(), texte }].slice(-60);
    await this.enregistrer(depot, numero, { journal });
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
      .filter((story) => story.numero !== numero)
      .map((story) => ({
        numero: story.numero,
        titre: story.titre,
        livree: story.fermeeLe !== null,
        parent: story.parent,
        decoupee: story.statut === 'parent',
      }));
  }

  /** Reconstitue la demande et les échanges depuis l'issue. */
  private async demande(jeton: string, depot: string, numero: number): Promise<Demande> {
    const detail = await this.stories.detail(jeton, depot, numero);
    const depart = detail.messages.findIndex((m) => m.texte.startsWith(DEBUT_LANCEMENT));
    const echanges = detail.messages
      .slice(depart + 1)
      .map((m) =>
        m.texte.startsWith(MARQUEUR_ASSISTANT)
          ? { auteur: 'assistant' as const, texte: m.texte.replace(MARQUEUR_ASSISTANT, '').trim() }
          : { auteur: 'po' as const, texte: m.texte.trim() },
      );
    return {
      numero,
      titre: detail.titre,
      type: detail.type,
      contenu: detail.contenu,
      contenuBug: detail.contenuBug,
      contenuLibre: detail.contenuLibre,
      parent: detail.parent,
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
    const { modeles, types } = this.projets.modeles();
    const disponibles = modeles.filter((modele) => modele.disponible);
    const dossier = await mkdtemp(join(tmpdir(), 'ada-conseil-'));
    let reponse = '';
    try {
      const args = [
        '-p',
        consigneConseilStack(texte, disponibles, types),
        '--output-format',
        'stream-json',
        '--verbose',
        '--max-turns',
        '2',
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
      await rm(dossier, { recursive: true, force: true });
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
  ): Promise<string> {
    let resultat = '';
    const args = [
      '-p',
      consigne,
      '--output-format',
      'stream-json',
      '--verbose',
      '--max-turns',
      String(this.tours[phase]),
      '--no-session-persistence',
      '--disallowedTools',
      ...OUTILS_INTERDITS,
      '--allowedTools',
      ...outilsAutorises(phase, dossiersLisibles),
    ];
    const notes: Promise<void>[] = [];
    const code = await this.lancerAgent(args, cwd, (ligne) => {
      for (const texte of decrireEvenement(ligne)) notes.push(this.noter(depot, numero, texte));
      try {
        const evt = JSON.parse(ligne) as { type?: string; result?: string };
        if (evt.type === 'result' && typeof evt.result === 'string') resultat = evt.result;
      } catch {
        /* ligne non JSON : ignorée */
      }
    });
    await Promise.all(notes);
    if (code !== 0 && !resultat) throw new Error(`L’agent s’est arrêté (code ${code})`);
    return resultat;
  }

  /** Démarre une tâche pour la demande ; une seule par projet (verrou partagé entre processus). */
  private async lancerTache(tache: Tache): Promise<void> {
    this.verifierDisponible();
    await this.acquerirVerrou(tache.depot, { pid: process.pid, numero: tache.numero, phase: tache.phase });
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
    this.verifierDisponible();
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
      await this.noter(depot, numero, 'Envoie la branche sur GitHub');
      await this.apercu.executer('git', ['-C', cwd, 'push', '--quiet', '-u', 'origin', branche], { env: this.apercu.environnementGit(jeton) });
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

  private async corpsConversation({ jeton, login, depot, numero }: Tache): Promise<void> {
    const demande = await this.demande(jeton, depot, numero);
    const branche = brancheDe(demande);
    const { cwd } = await this.preparerBranche(jeton, login, depot, branche);
    const skills = await this.equiperSkills(cwd);
    await this.noter(depot, numero, `Lit votre message (branche ${branche})`);
    const { controles, dsfr } = await this.apercu.lireConfig(cwd);
    const consigne = consigneConversation(demande, branche, await this.lireIndexRgaa(), skills.noms, controles, dsfr);
    const reponse = lireReponseConversation(await this.executer(depot, numero, 'conversation', consigne, cwd, skills.dossiers));
    if (!reponse) {
      await this.bloquer(jeton, depot, numero, 'ADA n’a pas réussi à répondre à votre message.');
      return;
    }
    // Des commits pas encore sur GitHub : on pousse la branche (jamais main) et l'aperçu les montre.
    const { stdout: nouveaux } = await this.apercu.executer('git', ['-C', cwd, 'rev-list', '--count', branche, '--not', '--remotes=origin']);
    if (Number(nouveaux.trim()) > 0) {
      await this.noter(depot, numero, 'Envoie la branche sur GitHub');
      await this.apercu.executer('git', ['-C', cwd, 'push', '--quiet', '-u', 'origin', branche], { env: this.apercu.environnementGit(jeton) });
      await this.noter(depot, numero, 'Relance l’aperçu');
      await this.apercu.relancerApplication(depot).catch((e: unknown) => this.log.warn(`Relance de l’aperçu de ${depot} : ${(e as Error).message.split('\n')[0]}`));
    }
    await this.stories.commenterAssistant(jeton, depot, numero, 'ADA', reponse);
    await this.stories.changerStatut(jeton, depot, numero, 'echange');
    await this.noter(depot, numero, 'À vous : répondez à ADA');
  }

  /** Le PO écrit dans la conversation : ADA reprend la main. */
  async reprendreConversation(jeton: string, login: string, depot: string, numero: number, texte: unknown): Promise<void> {
    this.verifierDisponible();
    const verification = verifierMessage(texte, false);
    if (!verification.ok) throw new BadRequestException(verification.erreur);
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.type !== 'conversation' || detail.statut !== 'echange') throw new ConflictException('ADA n’attend pas de message dans cette conversation');
    await this.stories.repondre(jeton, depot, numero, verification.texte);
    await this.stories.changerStatut(jeton, depot, numero, 'en-cours');
    await this.converser(jeton, login, depot, numero);
  }

  /**
   * « C'est bon » : les changements de la conversation deviennent une PR (contrôles, vérification
   * et fusion par le PO, comme une story). Aucun changement : la conversation se ferme, sans suite.
   */
  async terminerConversation(jeton: string, login: string, depot: string, numero: number): Promise<{ pullRequest: string | null }> {
    if (await this.verrouActif(depot)) throw new ConflictException('ADA travaille encore : attendez sa réponse');
    const demande = await this.demande(jeton, depot, numero);
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.type !== 'conversation' || detail.statut !== 'echange') throw new ConflictException('Cette conversation ne peut pas être terminée maintenant');
    const branche = brancheDe(demande);
    const cwd = await this.apercu.preparerDepot(jeton, depot);
    const { stdout: branches } = await this.apercu.executer('git', ['-C', cwd, 'branch', '--list', branche]);
    const { stdout: nombre } = branches.trim()
      ? await this.apercu.executer('git', ['-C', cwd, 'rev-list', '--count', `origin/main..${branche}`])
      : { stdout: '0' };
    if (Number(nombre.trim()) === 0) {
      await this.stories.fermerSansSuite(jeton, depot, numero, `💬 Conversation terminée par ${login}, sans changement à proposer au projet.`);
      return { pullRequest: null };
    }
    // Par sûreté (exécution interrompue avant l'envoi) : la branche doit être sur GitHub pour la PR.
    await this.apercu.executer('git', ['-C', cwd, 'push', '--quiet', '-u', 'origin', branche], { env: this.apercu.environnementGit(jeton) });
    const resume = `Changements faits avec ADA pendant la conversation #${numero}, demandés par ${login}.`;
    const pr = await this.ouvrirPullRequest(jeton, depot, cwd, branche, demande, resume);
    await this.enregistrer(depot, numero, { pullRequest: pr });
    await this.stories.commenterAssistant(
      jeton,
      depot,
      numero,
      'Changements proposés au projet',
      `Je propose ces changements au projet.\n\nLes contrôles automatiques tournent sur la pull request : ${pr}`,
    );
    await this.stories.changerStatut(jeton, depot, numero, 'en-verification');
    return { pullRequest: pr };
  }

  /** Le PO arrête la conversation : rien n'arrive sur le projet (la branche reste sur GitHub). */
  async arreterConversation(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    if (await this.verrouActif(depot)) throw new ConflictException('ADA travaille encore : attendez sa réponse');
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.type !== 'conversation' || detail.statut === 'livree') throw new ConflictException('Cette conversation est déjà terminée');
    await this.stories.fermerSansSuite(jeton, depot, numero, `💬 Conversation arrêtée par ${login} : rien n’est ajouté au projet.`);
  }

  /** Le PO demande de revoir le plan, ou répond aux questions : nouvelle analyse. */
  async reprendreAnalyse(jeton: string, depot: string, numero: number, texte: string): Promise<void> {
    this.verifierDisponible();
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

  private async bloquer(jeton: string, depot: string, numero: number, raison: string): Promise<void> {
    await this.stories.commenterAssistant(jeton, depot, numero, 'Besoin d’aide', `${raison}\n\nUn développeur doit regarder cette demande.`);
    await this.stories.changerStatut(jeton, depot, numero, 'besoin-dev');
    await this.enregistrer(depot, numero, { erreur: raison });
    await this.noter(depot, numero, 'Bloqué : un développeur doit intervenir');
  }
}
