import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Octokit } from '@octokit/rest';
import { ApercuService, type Executer } from '../apercu/apercu.service.js';
import { CONFIG, type Config } from '../config.js';
import { decrireErreurGithub, traduireErreurGithub } from '../github/erreurs.js';
import { GithubService } from '../github/github.service.js';
import { lireAdaConfig, type AdaConfig } from '../ada/ada-config.js';
import { catalogue, FAMILLES, LABELS_ATELIER, TYPES, type Modele } from './modeles.js';
import { personnaliser, validerProjet, type ValeursProjet } from './projet.js';
import { formaterPrompt, LABEL_LIBRE, MARQUEUR_LANCEMENT, STATUTS, titrePrompt } from '../stories/story.js';
import { identifiantProjet } from './depot.js';
import { prReprise } from './reprise.js';

/** Topic posé par une reprise (#37) : le projet entre dans ADA quand sa PR de reprise est fusionnée. */
export const TOPIC_REPRISE = 'ada-reprise';

export interface Projet {
  /** Identifiant dans ADA : « nom », ou « compte~nom » hors de l'organisation (voir depot.ts). */
  id: string;
  nom: string;
  proprietaire: string;
  /** Dépôt de l'organisation d'ADA, ou du compte personnel du PO. */
  compte: 'organisation' | 'personnel';
  /** Reprise pas encore validée (#37) : analyse en cours, ou PR de reprise à fusionner. */
  reprise: { pullRequest: string | null } | null;
  /** Projet repris (pas créé par ADA) : il peut être désynchronisé, sans rien supprimer. */
  repris: boolean;
  description: string | null;
  prive: boolean;
  url: string;
  misAJourLe: string | null;
}

/** Réglage GitHub fait automatiquement, ou à faire par le PO (avec le lien pour le faire). */
export interface Reglage {
  etat: 'fait' | 'a-faire';
  lien: string;
}

export interface ResultatCreation {
  projet: Projet;
  reglages: { versionsAutomatiques: Reglage; protectionMain: Reglage };
  /** Numéro de la demande créée à partir de l'idée du PO (l'assistant s'en saisit) ; null sans idée. */
  idee: number | null;
}

export type DepotGithub = {
  name: string;
  owner: { login: string };
  default_branch?: string;
  archived?: boolean;
  permissions?: { admin?: boolean; push?: boolean };
  description: string | null;
  private: boolean;
  html_url: string;
  updated_at?: string | null;
  topics?: string[];
};

export const versProjet = (d: DepotGithub, proprietaireParDefaut: string): Projet => ({
  id: identifiantProjet(d.owner.login, d.name, proprietaireParDefaut),
  nom: d.name,
  proprietaire: d.owner.login,
  compte: d.owner.login.toLowerCase() === proprietaireParDefaut.toLowerCase() ? 'organisation' : 'personnel',
  reprise: null,
  repris: (d.topics ?? []).includes(TOPIC_REPRISE),
  description: d.description,
  prive: d.private,
  url: d.html_url,
  misAJourLe: d.updated_at ?? null,
});

/** Topic posé le temps de la création : permet de reprendre une création interrompue. */
const TOPIC_CREATION = 'ada-creation';
const NOM_REGLE_MAIN = 'main protégée';
const execFileAsync = promisify(execFile);
const executerParDefaut: Executer = (commande, args, options) =>
  execFileAsync(commande, args, { ...options, maxBuffer: 10 * 1024 * 1024 });
const statut = (e: unknown) => (e as { status?: number }).status;

@Injectable()
export class ProjetsService {
  private readonly journal = new Logger(ProjetsService.name);
  executer: Executer = executerParDefaut;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly apercu: ApercuService,
  ) {}

  /** Topic des projets, plus l'ancien nom de l'outil (projets créés avant le passage à ADA). */
  private get topics(): string[] {
    return [this.config.TOPIC_ATELIER, 'atelier-po'];
  }

  private get proprietaire(): string {
    return this.config.GITHUB_PROPRIETAIRE;
  }

  /** Dossier `catalogue/` d'ADA : un sous-dossier par modèle (même chemin depuis src/ et dist/). */
  get dossierCatalogue(): string {
    return this.config.CATALOGUE
      ? resolve(this.config.CATALOGUE)
      : resolve(import.meta.dirname, '..', '..', '..', '..', 'catalogue');
  }

  /** Catalogue : un modèle n'est proposé que si son dossier est livré avec son ada.json. */
  modeles(): { familles: typeof FAMILLES; types: typeof TYPES; modeles: Modele[] } {
    const modeles = catalogue().map((modele) => {
      const config = this.configCatalogue(modele.id);
      return { ...modele, disponible: config !== null, deployable: Boolean(config?.deploiement) };
    });
    return { familles: FAMILLES, types: TYPES, modeles };
  }

  /** ada.json d'un modèle du catalogue ; null si le modèle n'est pas livré (ou illisible). */
  configCatalogue(id: string): AdaConfig | null {
    const chemin = join(this.dossierCatalogue, id, 'ada.json');
    if (!existsSync(chemin)) return null;
    try {
      return lireAdaConfig(readFileSync(chemin, 'utf8'));
    } catch (e) {
      this.journal.warn(`Modèle ${id} écarté : ${(e as Error).message}`);
      return null;
    }
  }

  /** ada.json d'un dépôt (sur GitHub) ; absent → comportement Vue + NestJS. */
  async lireConfigDepot(gh: Octokit, owner: string, repo: string, ref?: string): Promise<AdaConfig> {
    try {
      const { data } = await gh.repos.getContent({ owner, repo, path: 'ada.json', ...(ref ? { ref } : {}) });
      if (Array.isArray(data) || !('content' in data)) return lireAdaConfig(null);
      return lireAdaConfig(Buffer.from(data.content, 'base64').toString('utf8'));
    } catch (e) {
      if (statut(e) === 404) return lireAdaConfig(null);
      throw e;
    }
  }

  /**
   * Dépôts que le PO peut voir dans l'organisation d'ADA et dans son compte personnel (lecture
   * directe, pas la recherche GitHub, dont l'index met plusieurs minutes à voir un dépôt neuf).
   * Le jeton de l'application ne voit que les dépôts où elle est installée.
   */
  async depotsAccessibles(gh: Octokit, login: string): Promise<DepotGithub[]> {
    const personnels = (await gh.paginate(gh.repos.listForAuthenticatedUser, { affiliation: 'owner', per_page: 100 })) as DepotGithub[];
    if (this.proprietaire.toLowerCase() === login.toLowerCase()) return personnels;
    const organisation = (await gh.paginate(gh.repos.listForOrg, { org: this.proprietaire, per_page: 100 })) as DepotGithub[];
    return [...organisation, ...personnels];
  }

  aLeTopic(depot: DepotGithub, ...topics: string[]): boolean {
    return (depot.topics ?? []).some((topic) => topics.includes(topic));
  }

  /**
   * Projets d'ADA : dépôts portant le topic de l'atelier, et reprises (#37). Une reprise est
   * visible dès son lancement, pour suivre l'analyse et valider la PR ; une fois sa PR fusionnée
   * (ada.json sur main), elle reçoit le topic définitif et devient un projet comme les autres.
   */
  async lister(jeton: string, login: string): Promise<Projet[]> {
    const gh = this.github.client(jeton);
    try {
      const depots = await this.depotsAccessibles(gh, login);
      const reprises = await Promise.all(
        depots
          .filter((d) => !this.aLeTopic(d, ...this.topics) && this.aLeTopic(d, TOPIC_REPRISE))
          .map(async (d) => {
            const projet = versProjet(d, this.proprietaire);
            if (await this.repriseFusionnee(gh, d)) return projet;
            return { ...projet, reprise: { pullRequest: await prReprise(gh, d.owner.login, d.name) } };
          }),
      );
      const parDate = new Map(depots.map((d) => [identifiantProjet(d.owner.login, d.name, this.proprietaire), d.updated_at ?? '']));
      return [...depots.filter((d) => this.aLeTopic(d, ...this.topics)).map((d) => versProjet(d, this.proprietaire)), ...reprises].sort((a, b) =>
        (parDate.get(b.id) ?? '').localeCompare(parDate.get(a.id) ?? ''),
      );
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  private async repriseFusionnee(gh: Octokit, depot: DepotGithub): Promise<boolean> {
    const owner = depot.owner.login;
    try {
      await gh.repos.getContent({ owner, repo: depot.name, path: 'ada.json', ref: depot.default_branch ?? 'main' });
    } catch (e) {
      if (statut(e) === 404) return false;
      throw e;
    }
    // Le marquage « reprise » est gardé : il distingue un projet repris d'un projet créé par ADA.
    const topics = [...(depot.topics ?? []), this.config.TOPIC_ATELIER];
    await gh.repos.replaceAllTopics({ owner, repo: depot.name, names: topics }).catch((e: unknown) => {
      this.journal.warn(`Topic de ${owner}/${depot.name} non mis à jour : ${decrireErreurGithub(e)}`);
    });
    return true;
  }

  /**
   * Création d'un projet depuis `catalogue/<modele>/` :
   * 1. dépôt privé vide (topic provisoire « ada-creation », pour pouvoir reprendre) ;
   * 2. réglages avant le premier push (squash seul, release-please autorisé) ;
   * 3. copie du modèle personnalisée, poussée en un seul commit au nom du PO ;
   * 4. protection de main, topic définitif, labels.
   * Chaque étape est rejouable : une création interrompue est reprise avec le même nom.
   */
  async creer(jeton: string, login: string, donnees: unknown): Promise<ResultatCreation> {
    const validation = validerProjet(donnees);
    if (!validation.ok) throw new BadRequestException({ erreurs: validation.erreurs });
    const { projet, slug } = validation;
    const modele = this.modeles().modeles.find((m) => m.id === projet.modele);
    if (!modele?.disponible) throw new BadRequestException({ erreurs: { modele: 'Ce type de projet n’est pas encore disponible' } });
    const dossierModele = join(this.dossierCatalogue, modele.id);
    const configModele = lireAdaConfig(await readFile(join(dossierModele, 'ada.json'), 'utf8'));
    const gh = this.github.client(jeton);
    // Le projet appartient à la personne connectée : dépôt créé sur SON compte GitHub (avec son
    // jeton), jamais sur celui qui a configuré ADA. Les projets plus anciens restent où ils sont.
    const owner = login;
    const description = projet.objectif.slice(0, 350);

    // Un dépôt du même nom : si c'est une création d'ADA interrompue, on la reprend ; sinon le nom est pris.
    let existant: (DepotGithub & { template_repository?: { name?: string } | null }) | null = null;
    try {
      ({ data: existant } = await gh.repos.get({ owner, repo: slug }));
    } catch (e) {
      if (statut(e) !== 404) traduireErreurGithub(e);
    }
    const reprise = existant !== null && this.creationInterrompue(existant);
    if (existant && !reprise) {
      throw new ConflictException({ erreurs: { nom: `Un projet « ${slug} » existe déjà : choisissez un autre nom` } });
    }
    if (reprise) this.journal.log(`Reprise de la création interrompue de ${slug}`);

    let depot: DepotGithub;
    let versionsAutomatiques: Reglage['etat'];
    let protectionMain: Reglage['etat'];
    try {
      if (existant && reprise) {
        depot = existant;
        await gh.repos.update({ owner, repo: slug, description, private: projet.visibilite === 'prive' });
      } else {
        depot = await this.creerDepotVide(gh, slug, description, projet.visibilite === 'prive');
        await gh.repos.replaceAllTopics({ owner, repo: slug, names: [TOPIC_CREATION] });
      }
      // Réglages AVANT le premier push : ce push déclenche la CI et release-please.
      await this.imposerSquash(gh, owner, slug);
      versionsAutomatiques = await this.autoriserReleasePlease(gh, owner, slug);
      // Chart de déploiement : seulement si le PO prévoit de déployer le projet.
      const exclus = configModele.deploiement && !projet.deploye ? [configModele.deploiement.chart] : [];
      await this.pousserModele(jeton, login, slug, dossierModele, configModele.personnaliser, exclus, {
        nom: projet.nom,
        baseline: projet.baseline,
        slug,
        objectif: projet.objectif,
        date: new Date().toISOString().slice(0, 10),
        po: login,
      });
      protectionMain = await this.protegerMain(gh, owner, slug, configModele.controlesRequis);
      await gh.repos.replaceAllTopics({ owner, repo: slug, names: [this.config.TOPIC_ATELIER] });
      await this.poserLabels(gh, owner, slug);
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      traduireErreurGithub(e);
    }
    const idee = projet.idee ? await this.enregistrerIdee(gh, owner, slug, projet.idee, login) : null;

    const base = `https://github.com/${owner}/${slug}/settings`;
    return {
      projet: versProjet({ ...depot, owner: { login: owner } }, this.proprietaire),
      reglages: {
        versionsAutomatiques: { etat: versionsAutomatiques, lien: `${base}/actions` },
        protectionMain: { etat: protectionMain, lien: `${base}/rules` },
      },
      idee,
    };
  }

  /**
   * L'idée racontée à la création devient la première demande libre du projet, lancée aussitôt (#68) :
   * l'assistant pose ses questions puis propose l'objectif et les premières stories (découpage),
   * que le PO valide. Un échec ici ne défait pas la création : le PO pourra « Prompter » son idée.
   */
  private async enregistrerIdee(gh: Octokit, owner: string, repo: string, idee: string, login: string): Promise<number | null> {
    try {
      const { data } = await gh.issues.create({
        owner,
        repo,
        title: titrePrompt(idee),
        body: formaterPrompt(idee),
        labels: [LABEL_LIBRE, STATUTS['en-cours']],
      });
      await gh.issues.createComment({ owner, repo, issue_number: data.number, body: `${MARQUEUR_LANCEMENT} par ${login} (idée de départ du projet).` });
      return data.number;
    } catch (e) {
      this.journal.warn(`Idée de départ non enregistrée dans ${owner}/${repo} : ${decrireErreurGithub(e)}`);
      return null;
    }
  }

  /**
   * Création d'ADA restée en chemin : topic provisoire, ou (ancienne méthode) dépôt généré depuis
   * un dépôt modèle « modele-… » sans le topic d'ADA.
   */
  private creationInterrompue(depot: DepotGithub & { template_repository?: { name?: string } | null }): boolean {
    const topics = depot.topics ?? [];
    if (topics.some((topic) => this.topics.includes(topic))) return false;
    return topics.includes(TOPIC_CREATION) || (depot.template_repository?.name ?? '').startsWith('modele-');
  }

  /** Dépôt vide sur le compte de la personne connectée, privé ou public selon son choix. */
  private async creerDepotVide(gh: Octokit, slug: string, description: string, prive: boolean): Promise<DepotGithub> {
    const parametres = { name: slug, description, private: prive, auto_init: false };
    try {
      const { data } = await gh.repos.createForAuthenticatedUser(parametres);
      return data;
    } catch (e) {
      if (statut(e) === 404 || statut(e) === 403) {
        this.journal.warn(`Création de dépôt refusée : ${decrireErreurGithub(e)}`);
        throw new ForbiddenException(
          'L’application GitHub d’ADA ne peut pas créer de dépôt sur votre compte. ' +
            'Installez-la sur votre compte GitHub (page de l’application → Install → votre compte → « All repositories »), ' +
            'ou, si elle l’est déjà, acceptez les permissions demandées s’il y a une demande en attente.',
        );
      }
      throw e;
    }
  }

  /** Adresse git du dépôt d'un projet (remplaçable en test par un dépôt local). */
  urlDepot = (owner: string, repo: string) => `https://github.com/${owner}/${repo}.git`;

  /**
   * Copie du modèle (fichiers suivis par git uniquement : ni node_modules ni secrets locaux),
   * marqueurs remplacés, un seul commit au nom du PO. Sans différence (reprise), rien n'est poussé.
   */
  private async pousserModele(
    jeton: string,
    login: string,
    slug: string,
    dossierModele: string,
    aPersonnaliser: string[],
    exclus: string[],
    valeurs: ValeursProjet,
  ): Promise<void> {
    const travail = await mkdtemp(join(tmpdir(), 'ada-creation-'));
    const copie = join(travail, 'depot');
    const env = this.apercu.environnementGit(jeton);
    const git = (...args: string[]) => this.executer('git', ['-C', copie, ...args], { env });
    try {
      await this.executer('git', ['clone', '--quiet', this.urlDepot(login, slug), copie], { env });
      await git('symbolic-ref', 'HEAD', 'refs/heads/main');
      await git('rm', '-r', '-q', '--ignore-unmatch', '--', '.');
      const { stdout } = await this.executer(
        'git',
        ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'],
        { cwd: dossierModele },
      );
      const fichiers = stdout
        .split('\0')
        .filter(Boolean)
        .filter((fichier) => !exclus.some((dossier) => fichier === dossier || fichier.startsWith(`${dossier.replace(/\/$/, '')}/`)));
      if (!fichiers.includes('ada.json')) throw new Error(`Modèle incomplet : ${dossierModele}`);
      for (const fichier of fichiers) {
        const cible = join(copie, fichier);
        await mkdir(dirname(cible), { recursive: true });
        await copyFile(join(dossierModele, fichier), cible);
        if (aPersonnaliser.includes(fichier)) {
          await writeFile(cible, personnaliser(await readFile(cible, 'utf8'), valeurs));
        }
      }
      await git('add', '-A');
      const { stdout: changements } = await git('status', '--porcelain');
      if (!changements.trim()) return;
      await git(
        '-c', `user.name=${login}`,
        '-c', `user.email=${login}@users.noreply.github.com`,
        'commit', '--quiet', '-m', `chore: création du projet ${valeurs.nom}`,
      );
      await git('push', '--quiet', 'origin', 'main');
    } finally {
      await rm(travail, { recursive: true, force: true });
    }
  }

  /**
   * Labels dont dépendent les formulaires d'issue (ils ne posent un label que s'il existe) et
   * les statuts de l'atelier. Un dépôt créé depuis un modèle n'hérite pas de ses labels.
   */
  async poserLabels(gh: Octokit, owner: string, repo: string): Promise<void> {
    for (const label of LABELS_ATELIER) {
      try {
        await gh.issues.createLabel({ owner, repo, ...label });
      } catch (e) {
        if (statut(e) !== 422) throw e; // 422 : le label existe déjà (ex. « bug »)
      }
    }
  }

  /**
   * Fusion en « Squash and merge » uniquement : un commit par demande, titré comme la PR
   * (Conventional Commits pour release-please) ; branches supprimées après fusion.
   */
  private async imposerSquash(gh: Octokit, owner: string, repo: string): Promise<void> {
    try {
      await gh.repos.update({
        owner,
        repo,
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: false,
        delete_branch_on_merge: true,
        squash_merge_commit_title: 'PR_TITLE',
        squash_merge_commit_message: 'PR_BODY',
      });
    } catch (e) {
      this.journal.warn(`Squash non imposé sur ${repo} (${statut(e)}) : les fusions par ADA restent en squash`);
    }
  }

  /** Workflow permissions : lecture/écriture + création de PR (release-please). */
  private async autoriserReleasePlease(gh: Octokit, owner: string, repo: string): Promise<Reglage['etat']> {
    try {
      await gh.request('PUT /repos/{owner}/{repo}/actions/permissions/workflow', {
        owner,
        repo,
        default_workflow_permissions: 'write',
        can_approve_pull_request_reviews: true,
      });
      return 'fait';
    } catch (e) {
      this.journal.warn(`Réglage Actions refusé sur ${repo} (${statut(e)}) : à faire par le PO`);
      return 'a-faire';
    }
  }

  /** Ruleset sur main : PR obligatoire, CI verte, ni suppression ni force push. */
  private async protegerMain(gh: Octokit, owner: string, repo: string, controlesRequis: string[]): Promise<Reglage['etat']> {
    try {
      // Reprise d'une création : la règle peut déjà exister.
      const { data: existantes } = await gh.request('GET /repos/{owner}/{repo}/rulesets', { owner, repo });
      if ((existantes ?? []).some((regle: { name?: string }) => regle.name === NOM_REGLE_MAIN)) return 'fait';
      await gh.request('POST /repos/{owner}/{repo}/rulesets', {
        owner,
        repo,
        name: NOM_REGLE_MAIN,
        target: 'branch',
        enforcement: 'active',
        conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
        rules: [
          { type: 'deletion' },
          { type: 'non_fast_forward' },
          {
            type: 'pull_request',
            parameters: {
              required_approving_review_count: 0,
              dismiss_stale_reviews_on_push: false,
              require_code_owner_review: false,
              require_last_push_approval: false,
              required_review_thread_resolution: false,
            },
          },
          {
            type: 'required_status_checks',
            parameters: {
              strict_required_status_checks_policy: false,
              required_status_checks: controlesRequis.map((context) => ({ context })),
            },
          },
        ],
      });
      return 'fait';
    } catch (e) {
      // Compte personnel gratuit + dépôt privé : règles indisponibles (403/422).
      this.journal.warn(`Protection de main refusée sur ${repo} (${statut(e)}) : à faire ou indisponible`);
      return 'a-faire';
    }
  }
}
