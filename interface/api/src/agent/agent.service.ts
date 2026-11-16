import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ApercuService } from '../apercu/apercu.service.js';
import { CONFIG, type Config } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { DEBUT_LANCEMENT, MARQUEUR_ASSISTANT, StoriesService } from '../stories/stories.service.js';
import {
  brancheDe,
  consigneAnalyse,
  consigneRealisation,
  decrireEvenement,
  lireDecision,
  lireResultat,
  OUTILS,
  type Demande,
  type Phase,
} from './agent.js';

export interface Activite {
  phase: Phase | null;
  enCours: boolean;
  debut: string | null;
  journal: { le: string; texte: string }[];
  erreur: string | null;
  pullRequest: string | null;
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
  /** Une seule exécution à la fois par projet (une seule demande active). */
  private readonly enCours = new Set<string>();
  lancerAgent: LancerAgent;
  /** Dernière tâche de fond lancée (permet aux tests d'en attendre la fin). */
  derniereTache: Promise<void> = Promise.resolve();
  /** Tours maximum de l'agent par phase. */
  tours: Record<Phase, number> = { analyse: 30, realisation: 150 };

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly stories: StoriesService,
    private readonly apercu: ApercuService,
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
  async equiperSkills(cwd: string): Promise<string[]> {
    const disponibles = this.config.AGENT_SKILLS.filter((dossier) => existsSync(join(dossier, 'SKILL.md')));
    if (!disponibles.length) return [];
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
    return disponibles.map((dossier) => basename(dossier));
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

  /** « En cours » seulement si un agent tourne vraiment (pas un reste d'exécution interrompue). */
  async activite(depot: string, numero: number): Promise<Activite> {
    const activite = await this.lireActivite(depot, numero);
    return { ...activite, enCours: activite.enCours && this.enCours.has(depot) };
  }

  /**
   * Demande en cours ou bloquée sans agent actif. Plan déjà validé (dernière phase : réalisation)
   * → on reprend la réalisation ; sinon → nouvelle analyse.
   */
  async relancer(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    this.verifierDisponible();
    if (this.enCours.has(depot)) throw new ConflictException('L’assistant travaille déjà sur ce projet');
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.statut !== 'en-cours' && detail.statut !== 'besoin-dev') {
      throw new ConflictException('Cette demande n’a pas besoin d’être relancée');
    }
    await this.stories.changerStatut(jeton, depot, numero, 'en-cours');
    const precedente = await this.lireActivite(depot, numero);
    if (precedente.phase === 'realisation') {
      await this.noter(depot, numero, 'Reprend la réalisation');
      this.realiser(jeton, login, depot, numero);
    } else {
      this.analyser(jeton, depot, numero);
    }
  }

  private async enregistrer(depot: string, numero: number, maj: Partial<Activite>): Promise<Activite> {
    const activite = { ...(await this.lireActivite(depot, numero)), ...maj };
    await mkdir(dirname(this.fichier(depot, numero)), { recursive: true });
    await writeFile(this.fichier(depot, numero), JSON.stringify(activite, null, 2));
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
      echanges,
    };
  }

  /** Exécute une phase de l'agent et renvoie sa réponse finale (texte). */
  private async executer(depot: string, numero: number, phase: Phase, consigne: string, cwd: string): Promise<string> {
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
      '--allowedTools',
      ...OUTILS[phase],
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

  /** Démarre une tâche de fond pour la demande ; une seule par projet. */
  private demarrerTache(depot: string, numero: number, phase: Phase, tache: () => Promise<void>): void {
    this.verifierDisponible();
    if (this.enCours.has(depot)) throw new ConflictException('L’assistant travaille déjà sur ce projet');
    this.enCours.add(depot);
    this.derniereTache = (async () => {
      await this.enregistrer(depot, numero, { phase, enCours: true, debut: new Date().toISOString(), erreur: null });
      try {
        await tache();
        await this.enregistrer(depot, numero, { enCours: false });
      } catch (e) {
        const message = (e as Error).message;
        this.log.warn(`Agent sur ${depot}#${numero} (${phase}) : ${message}`);
        await this.enregistrer(depot, numero, { enCours: false, erreur: message });
      } finally {
        this.enCours.delete(depot);
      }
    })();
  }

  /** Analyse : questions ou plan, publiés dans l'issue ; aucune modification du code. */
  analyser(jeton: string, depot: string, numero: number): void {
    this.demarrerTache(depot, numero, 'analyse', async () => {
      await this.noter(depot, numero, 'Prépare le projet');
      const cwd = await this.apercu.preparerDepot(jeton, depot);
      const skills = await this.equiperSkills(cwd);
      await this.noter(depot, numero, 'Lit la story et le projet');
      const consigne = consigneAnalyse(await this.demande(jeton, depot, numero), await this.lireIndexRgaa(), skills);
      const reponse = await this.executer(depot, numero, 'analyse', consigne, cwd);
      const decision = lireDecision(reponse);
      if (!decision) {
        await this.bloquer(jeton, depot, numero, 'L’assistant n’a pas réussi à analyser la demande.');
        return;
      }
      const questions = decision.decision === 'questions';
      await this.stories.commenterAssistant(jeton, depot, numero, questions ? 'Questions de l’assistant' : 'Plan proposé', decision.texte);
      await this.stories.changerStatut(jeton, depot, numero, questions ? 'questions' : 'plan-a-valider');
      await this.noter(depot, numero, questions ? 'Attend vos réponses' : 'Attend que vous validiez le plan');
    });
  }

  /** Le PO valide le plan : réalisation sur une branche, puis branche poussée et PR ouverte. */
  async validerPlan(jeton: string, login: string, depot: string, numero: number): Promise<void> {
    this.verifierDisponible();
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.statut !== 'plan-a-valider') throw new ConflictException('Aucun plan n’attend votre validation');
    await this.stories.repondre(jeton, depot, numero, `✅ Plan validé par ${login}.`);
    await this.stories.changerStatut(jeton, depot, numero, 'en-cours');
    this.realiser(jeton, login, depot, numero);
  }

  private realiser(jeton: string, login: string, depot: string, numero: number): void {
    this.demarrerTache(depot, numero, 'realisation', async () => {
      const demande = await this.demande(jeton, depot, numero);
      const branche = brancheDe(demande);
      const { cwd, travailRepris } = await this.preparerBranche(jeton, login, depot, branche);
      const skills = await this.equiperSkills(cwd);
      await this.noter(depot, numero, travailRepris ? `Reprend le travail interrompu sur ${branche}` : `Travaille sur la branche ${branche}`);
      const reprise = travailRepris
        ? '\n\nReprise : une exécution précédente a été interrompue. Les fichiers modifiés ou non suivis de la branche (git status) sont ce travail en cours : vérifie-les et continue, sans repartir de zéro.'
        : '';
      const consigne = consigneRealisation(demande, branche, await this.lireIndexRgaa(), skills) + reprise;
      const reponse = await this.executer(depot, numero, 'realisation', consigne, cwd);
      const resultat = lireResultat(reponse);
      if (!resultat || resultat.resultat === 'bloque') {
        await this.bloquer(jeton, depot, numero, resultat?.resultat === 'bloque' ? resultat.raison : 'L’assistant n’a pas terminé la réalisation.');
        return;
      }
      const { stdout: nbCommits } = await this.apercu.executer('git', ['-C', cwd, 'rev-list', '--count', `origin/main..${branche}`]);
      if (Number(nbCommits.trim()) === 0) {
        await this.bloquer(jeton, depot, numero, 'L’assistant n’a enregistré aucune modification.');
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
      await this.stories.changerStatut(jeton, depot, numero, 'en-verification');
      await this.noter(depot, numero, 'Terminé : à vous de vérifier');
    });
  }

  /** Le PO demande de revoir le plan, ou répond aux questions : nouvelle analyse. */
  async reprendreAnalyse(jeton: string, depot: string, numero: number, texte: string): Promise<void> {
    this.verifierDisponible();
    const detail = await this.stories.detail(jeton, depot, numero);
    if (detail.statut !== 'questions' && detail.statut !== 'plan-a-valider') {
      throw new ConflictException('L’assistant n’attend pas de réponse sur cette demande');
    }
    await this.stories.repondre(jeton, depot, numero, texte);
    await this.stories.changerStatut(jeton, depot, numero, 'en-cours');
    this.analyser(jeton, depot, numero);
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
      owner: this.config.GITHUB_PROPRIETAIRE,
      repo: depot,
      head: branche,
      base: 'main',
      title: `${demande.type === 'bug' ? 'fix' : 'feat'}: ${demande.titre}`,
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
