import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { CONFIG, type Config } from '../config.js';
import { decrireErreurGithub, traduireErreurGithub } from '../github/erreurs.js';
import { GithubService } from '../github/github.service.js';
import { lireAdaConfig } from '../ada/ada-config.js';
import { identifiantProjet, lireIdentifiant, verifierAcces } from './depot.js';
import { ProjetsService, TOPIC_REPRISE, type DepotGithub } from './projets.service.js';

/** Branche et titre de la PR de reprise (Conventional Commits : `chore`, sans nouvelle version). */
export const BRANCHE_REPRISE = 'ada/reprise';
export const TITRE_REPRISE = 'chore: reprise du projet par ADA';
/** Seul contrôle exigé : le titre de PR, ajouté par la reprise. La CI du projet reste la sienne. */
const CONTROLE_TITRE = 'Titre de PR (Conventional Commits, semver)';

/**
 * Fichiers qu'ADA apporte à un projet repris, s'ils n'y sont pas déjà : formulaires de story et de
 * signalement, vérification du titre des PR, versions par release-please. `ada.json` est toujours
 * proposé (il décrit l'aperçu) ; rien d'autre n'est touché.
 */
export const FICHIERS_REPRISE = [
  '.github/ISSUE_TEMPLATE/user-story.yml',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/workflows/titre-pr.yml',
  '.github/workflows/release-please.yml',
  'release-please-config.json',
  '.release-please-manifest.json',
  'version.txt',
];

export interface DepotAReprendre {
  id: string;
  nom: string;
  proprietaire: string;
  compte: 'organisation' | 'personnel';
  description: string | null;
  url: string;
  /** PR de reprise déjà ouverte, en attente de validation par le PO. */
  repriseEnCours: string | null;
}

export interface ResultatReprise {
  pullRequest: string;
  fichiers: string[];
}

const schemaReprise = z.object({ depot: z.string().min(1).max(141), modele: z.string().regex(/^[a-z0-9-]{1,60}$/) });
const statut = (e: unknown) => (e as { status?: number }).status;

/** ada.json d'un projet repris : celui du modèle choisi, avec le seul contrôle apporté par la reprise. */
export function adaJsonReprise(contenuModele: string): string {
  const config = JSON.parse(contenuModele) as Record<string, unknown>;
  lireAdaConfig(contenuModele);
  return `${JSON.stringify({ ...config, personnaliser: [], controlesRequis: [CONTROLE_TITRE], deploiement: null }, null, 2)}\n`;
}

export function corpsReprise(modele: string, fichiers: string[], login: string): string {
  return [
    `Reprise du projet par ADA, demandée par @${login}, avec la stack la plus proche : **${modele}**.`,
    '',
    'Fichiers ajoutés (ceux déjà présents ne sont pas modifiés) :',
    ...fichiers.map((fichier) => `- \`${fichier}\``),
    '',
    'Une fois cette PR fusionnée, le projet apparaît dans ADA : stories, aperçu et versions.',
    '',
    '`ada.json` décrit comment ADA démarre l’aperçu. Si l’aperçu ne démarre pas après la reprise, un développeur l’ajuste à la structure du projet.',
  ].join('\n');
}

@Injectable()
export class RepriseService {
  private readonly journal = new Logger(RepriseService.name);

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly projets: ProjetsService,
  ) {}

  /** Dépôts de l'organisation et du compte du PO qui ne sont pas encore dans ADA. */
  async lister(jeton: string, login: string): Promise<DepotAReprendre[]> {
    const gh = this.github.client(jeton);
    try {
      const depots = (await this.projets.depotsAccessibles(gh, login)).filter(
        (d) => !d.archived && d.permissions?.push !== false && !this.projets.aLeTopic(d, this.config.TOPIC_ATELIER, 'atelier-po', 'ada-creation'),
      );
      const projets = new Set((await this.projets.lister(jeton, login)).map((projet) => projet.id));
      return Promise.all(
        depots
          .map((d) => ({ d, id: identifiantProjet(d.owner.login, d.name, this.config.GITHUB_PROPRIETAIRE) }))
          .filter(({ id }) => !projets.has(id))
          .sort((a, b) => a.d.name.localeCompare(b.d.name))
          .map(async ({ d, id }) => ({
            id,
            nom: d.name,
            proprietaire: d.owner.login,
            compte: d.owner.login.toLowerCase() === this.config.GITHUB_PROPRIETAIRE.toLowerCase() ? ('organisation' as const) : ('personnel' as const),
            description: d.description,
            url: d.html_url,
            repriseEnCours: this.projets.aLeTopic(d, TOPIC_REPRISE) ? await this.prOuverte(gh, d.owner.login, d.name) : null,
          })),
      );
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  /**
   * Propose la reprise : topic provisoire, branche `ada/reprise` (un seul commit avec les fichiers
   * manquants), labels d'ADA, puis PR vers main. Rien n'arrive sur main sans la validation du PO.
   * Rejouable : une reprise déjà proposée renvoie sa PR.
   */
  async reprendre(jeton: string, login: string, donnees: unknown): Promise<ResultatReprise> {
    const saisie = schemaReprise.safeParse(donnees);
    if (!saisie.success) throw new BadRequestException('Choisissez un dépôt et une stack');
    const { owner, repo } = lireIdentifiant(saisie.data.depot, this.config.GITHUB_PROPRIETAIRE);
    verifierAcces({ owner, repo }, login, this.config.GITHUB_PROPRIETAIRE);
    const modele = this.projets.modeles().modeles.find((m) => m.id === saisie.data.modele);
    if (!modele?.disponible) throw new BadRequestException('Cette stack n’est pas disponible');
    const gh = this.github.client(jeton);

    let depot: DepotGithub;
    try {
      ({ data: depot } = await gh.repos.get({ owner, repo }));
    } catch (e) {
      traduireErreurGithub(e);
    }
    if (this.projets.aLeTopic(depot, this.config.TOPIC_ATELIER, 'atelier-po')) throw new ConflictException('Ce projet est déjà dans ADA');
    if (depot.archived) throw new BadRequestException('Ce dépôt est archivé : il ne peut pas être repris');
    if (depot.default_branch !== 'main') {
      throw new BadRequestException(`La branche principale de ce dépôt s’appelle « ${depot.default_branch} » : ADA travaille sur « main ». Un développeur doit la renommer avant la reprise.`);
    }

    try {
      const dejaOuverte = await this.prOuverte(gh, owner, repo);
      if (dejaOuverte) return { pullRequest: dejaOuverte, fichiers: [] };

      await gh.repos
        .replaceAllTopics({ owner, repo, names: [...new Set([...(depot.topics ?? []), TOPIC_REPRISE])] })
        .catch((e: unknown) => {
          if (statut(e) === 403 || statut(e) === 404) {
            throw new ForbiddenException('Seul un administrateur de ce dépôt peut le faire reprendre par ADA.');
          }
          throw e;
        });
      const fichiers = await this.fichiersAApporter(gh, owner, repo, modele.id);
      await this.pousserBranche(gh, owner, repo, fichiers, login);
      await this.projets.poserLabels(gh, owner, repo);
      const { data: pr } = await gh.pulls.create({
        owner,
        repo,
        head: BRANCHE_REPRISE,
        base: 'main',
        title: TITRE_REPRISE,
        body: `${corpsReprise(modele.libelle, [...fichiers.keys()], login)}\n\n🤖 Proposée par ADA`,
      });
      return { pullRequest: pr.html_url, fichiers: [...fichiers.keys()] };
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.journal.warn(`Reprise de ${owner}/${repo} : ${decrireErreurGithub(e)}`);
      traduireErreurGithub(e);
    }
  }

  private async prOuverte(gh: Octokit, owner: string, repo: string): Promise<string | null> {
    const { data } = await gh.pulls.list({ owner, repo, head: `${owner}:${BRANCHE_REPRISE}`, state: 'open', per_page: 1 });
    return data[0]?.html_url ?? null;
  }

  /** Fichiers du modèle absents de main, plus ada.json (toujours proposé). */
  private async fichiersAApporter(gh: Octokit, owner: string, repo: string, modele: string): Promise<Map<string, string>> {
    const dossier = join(this.projets.dossierCatalogue, modele);
    const fichiers = new Map<string, string>();
    for (const chemin of FICHIERS_REPRISE) {
      if (await this.existe(gh, owner, repo, chemin)) continue;
      fichiers.set(chemin, await readFile(join(dossier, chemin), 'utf8'));
    }
    fichiers.set('ada.json', adaJsonReprise(await readFile(join(dossier, 'ada.json'), 'utf8')));
    return fichiers;
  }

  private async existe(gh: Octokit, owner: string, repo: string, path: string): Promise<boolean> {
    try {
      await gh.repos.getContent({ owner, repo, path, ref: 'main' });
      return true;
    } catch (e) {
      if (statut(e) === 404) return false;
      throw e;
    }
  }

  /** Un commit au nom du PO sur `ada/reprise`, depuis main (branche recréée si elle existait). */
  private async pousserBranche(gh: Octokit, owner: string, repo: string, fichiers: Map<string, string>, login: string): Promise<void> {
    const { data: main } = await gh.git.getRef({ owner, repo, ref: 'heads/main' });
    const { data: commitMain } = await gh.git.getCommit({ owner, repo, commit_sha: main.object.sha });
    const { data: arbre } = await gh.git.createTree({
      owner,
      repo,
      base_tree: commitMain.tree.sha,
      tree: [...fichiers].map(([path, content]) => ({ path, mode: '100644' as const, type: 'blob' as const, content })),
    });
    const { data: commit } = await gh.git.createCommit({
      owner,
      repo,
      message: TITRE_REPRISE,
      tree: arbre.sha,
      parents: [main.object.sha],
      author: { name: login, email: `${login}@users.noreply.github.com` },
    });
    try {
      await gh.git.createRef({ owner, repo, ref: `refs/heads/${BRANCHE_REPRISE}`, sha: commit.sha });
    } catch (e) {
      if (statut(e) !== 422) throw e; // la branche existe (reprise interrompue) : on la remplace
      await gh.git.updateRef({ owner, repo, ref: `heads/${BRANCHE_REPRISE}`, sha: commit.sha, force: true });
    }
  }
}
