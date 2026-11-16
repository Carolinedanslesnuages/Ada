import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Octokit } from '@octokit/rest';
import { CONFIG, type Config } from '../config.js';
import { traduireErreurGithub } from '../github/erreurs.js';
import { GithubService } from '../github/github.service.js';
import { catalogue, CONTROLES_REQUIS, FICHIERS_A_PERSONNALISER, type Modele } from './modeles.js';
import { personnaliser, validerProjet, type ValeursProjet } from './projet.js';

export interface Projet {
  nom: string;
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
}

type DepotGithub = {
  name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  updated_at?: string | null;
  topics?: string[];
};

const versProjet = (d: DepotGithub): Projet => ({
  nom: d.name,
  description: d.description,
  prive: d.private,
  url: d.html_url,
  misAJourLe: d.updated_at ?? null,
});

const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const statut = (e: unknown) => (e as { status?: number }).status;

@Injectable()
export class ProjetsService {
  private readonly journal = new Logger(ProjetsService.name);
  /** Attente entre deux vérifications pendant la génération du dépôt (réduite en test). */
  attenteMs = 1500;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
  ) {}

  private get proprietaire(): string {
    return this.config.GITHUB_PROPRIETAIRE;
  }

  modeles(): Modele[] {
    return catalogue(this.config);
  }

  /**
   * Dépôts du propriétaire portant le topic de l'atelier. Lecture directe (pas la recherche
   * GitHub, dont l'index met plusieurs minutes à voir un dépôt neuf).
   */
  async lister(jeton: string, login: string): Promise<Projet[]> {
    const gh = this.github.client(jeton);
    try {
      const depots = (
        this.proprietaire.toLowerCase() === login.toLowerCase()
          ? await gh.paginate(gh.repos.listForAuthenticatedUser, { affiliation: 'owner', per_page: 100 })
          : await gh.paginate(gh.repos.listForOrg, { org: this.proprietaire, per_page: 100 })
      ) as DepotGithub[];
      return depots
        .filter((d) => d.topics?.includes(this.config.TOPIC_ATELIER))
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
        .map(versProjet);
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  async creer(jeton: string, login: string, donnees: unknown): Promise<ResultatCreation> {
    const validation = validerProjet(donnees);
    if (!validation.ok) throw new BadRequestException({ erreurs: validation.erreurs });
    const { projet, slug } = validation;
    const modele = this.modeles().find((m) => m.id === projet.modele);
    if (!modele?.depot) throw new BadRequestException({ erreurs: { modele: 'Cette stack n’est pas encore disponible' } });
    const [modeleProprietaire, modeleDepot] = modele.depot.split('/') as [string, string];
    const gh = this.github.client(jeton);
    const owner = this.proprietaire;

    try {
      await gh.repos.get({ owner, repo: slug });
      throw new ConflictException({ erreurs: { nom: `Un projet « ${slug} » existe déjà : choisissez un autre nom` } });
    } catch (e) {
      if (e instanceof ConflictException) throw e;
      if (statut(e) !== 404) traduireErreurGithub(e);
    }

    let depot: DepotGithub;
    try {
      ({ data: depot } = await gh.repos.createUsingTemplate({
        template_owner: modeleProprietaire,
        template_repo: modeleDepot,
        owner,
        name: slug,
        description: projet.objectif.slice(0, 350),
        private: true,
      }));
      await this.attendreContenu(gh, owner, slug);
      await this.personnaliserDepot(gh, owner, slug, {
        nom: projet.nom,
        slug,
        objectif: projet.objectif,
        date: new Date().toISOString().slice(0, 10),
        po: login,
      });
      await gh.repos.replaceAllTopics({ owner, repo: slug, names: [this.config.TOPIC_ATELIER] });
    } catch (e) {
      traduireErreurGithub(e);
    }

    const base = `https://github.com/${owner}/${slug}/settings`;
    return {
      projet: versProjet(depot),
      reglages: {
        versionsAutomatiques: { etat: await this.autoriserReleasePlease(gh, owner, slug), lien: `${base}/actions` },
        protectionMain: { etat: await this.protegerMain(gh, owner, slug), lien: `${base}/rules` },
      },
    };
  }

  /** La génération depuis un modèle est asynchrone : attendre que les fichiers soient là. */
  private async attendreContenu(gh: Octokit, owner: string, repo: string): Promise<void> {
    for (let essai = 0; essai < 20; essai++) {
      try {
        await gh.repos.getContent({ owner, repo, path: 'PROJET.md' });
        return;
      } catch (e) {
        if (statut(e) !== 404 && statut(e) !== 409) throw e;
        await pause(this.attenteMs);
      }
    }
    throw new Error('Le dépôt a été créé mais ses fichiers ne sont pas apparus à temps');
  }

  /** Un seul commit qui remplace les marqueurs dans tous les fichiers concernés. */
  private async personnaliserDepot(gh: Octokit, owner: string, repo: string, valeurs: ValeursProjet): Promise<void> {
    const { data: ref } = await gh.git.getRef({ owner, repo, ref: 'heads/main' });
    const parent = ref.object.sha;
    const { data: commitParent } = await gh.git.getCommit({ owner, repo, commit_sha: parent });
    const entrees: { path: string; mode: '100644'; type: 'blob'; content: string }[] = [];
    for (const path of FICHIERS_A_PERSONNALISER) {
      const { data } = await gh.repos.getContent({ owner, repo, path, ref: parent });
      if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) continue;
      const original = Buffer.from(data.content, 'base64').toString('utf8');
      const nouveau = personnaliser(original, valeurs);
      if (nouveau !== original) entrees.push({ path, mode: '100644', type: 'blob', content: nouveau });
    }
    const { data: arbre } = await gh.git.createTree({ owner, repo, base_tree: commitParent.tree.sha, tree: entrees });
    const { data: commit } = await gh.git.createCommit({
      owner,
      repo,
      message: `chore: personnalisation du projet ${valeurs.nom}`,
      tree: arbre.sha,
      parents: [parent],
    });
    await gh.git.updateRef({ owner, repo, ref: 'heads/main', sha: commit.sha });
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
  private async protegerMain(gh: Octokit, owner: string, repo: string): Promise<Reglage['etat']> {
    try {
      await gh.request('POST /repos/{owner}/{repo}/rulesets', {
        owner,
        repo,
        name: 'main protégée',
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
              required_status_checks: CONTROLES_REQUIS.map((context) => ({ context })),
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
