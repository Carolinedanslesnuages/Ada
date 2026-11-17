import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { traduireErreurGithub } from '../github/erreurs.js';
import { GithubService } from '../github/github.service.js';
import { ProjetsService, type Projet } from '../projets/projets.service.js';
import { RegistreService } from './registre.service.js';
import { bilan, etatProjet, type BilanProjets } from './registre.js';
import { STATUTS, typeDepuis } from '../stories/story.js';
import { calculerIndicateurs, lireHistorique, type DemandeMesuree, type Indicateurs } from './indicateurs.js';

type IssueGithub = {
  number: number;
  state: string;
  closed_at?: string | null;
  body?: string | null;
  pull_request?: unknown;
  labels: (string | { name?: string })[];
};

/** Indicateurs calculés depuis GitHub (aucune base) ; mis en cache 5 minutes par utilisateur. */
@Injectable()
export class IndicateursService {
  private readonly cache = new Map<string, { le: number; indicateurs: Indicateurs }>();

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly projets: ProjetsService,
    private readonly registre: RegistreService,
  ) {}

  /**
   * Tous les projets passés par ADA (registre) que ce PO peut voir : ceux de l'organisation et de
   * son compte. Leur état vient de GitHub ; un dépôt introuvable compte comme supprimé.
   */
  private async historique(gh: ReturnType<GithubService['client']>, login: string, projetsActuels: Projet[]): Promise<BilanProjets> {
    for (const projet of projetsActuels) await this.registre.noter(projet.id, projet.repris ? 'repris' : 'inconnue', null);
    const comptes = [this.config.GITHUB_PROPRIETAIRE.toLowerCase(), login.toLowerCase()];
    const visibles = (await this.registre.lire()).filter((entree) => comptes.includes(entree.owner.toLowerCase()));
    const etats = await Promise.all(
      visibles.map(async (entree) => {
        const depot = await gh.repos
          .get({ owner: entree.owner, repo: entree.repo })
          .then(({ data }) => data)
          .catch((e: unknown) => {
            if ((e as { status?: number }).status === 404) return null;
            throw e;
          });
        return { origine: entree.origine, etat: etatProjet(depot, this.config.TOPIC_ATELIER) };
      }),
    );
    return bilan(etats);
  }

  async calculer(jeton: string, login: string): Promise<Indicateurs> {
    const enCache = this.cache.get(login);
    if (enCache && Date.now() - enCache.le < 5 * 60 * 1000) return enCache.indicateurs;
    const gh = this.github.client(jeton);
    try {
      const projets = await this.projets.lister(jeton, login);
      const mesures = await Promise.all(
        projets.map(async (projet) => {
          const issues = (await gh.paginate(gh.issues.listForRepo, { owner: projet.proprietaire, repo: projet.nom, state: 'all', per_page: 100 })) as IssueGithub[];
          const demandes = issues.filter((issue) => !issue.pull_request && typeDepuis(issue.labels.map((label) => (typeof label === 'string' ? label : (label.name ?? ''))), issue.body ?? ''));
          const mesurees: DemandeMesuree[] = await Promise.all(
            demandes.map(async (issue) => {
              const evenements = await gh.paginate(gh.issues.listEvents, { owner: projet.proprietaire, repo: projet.nom, issue_number: issue.number, per_page: 100 });
              return {
                livree: issue.state === 'closed',
                fermeeLe: issue.closed_at ?? null,
                ...lireHistorique(evenements as Parameters<typeof lireHistorique>[0], STATUTS['en-cours']),
              };
            }),
          );
          return { nom: projet.nom, demandes: mesurees };
        }),
      );
      const indicateurs = calculerIndicateurs(mesures, await this.historique(gh, login, projets));
      this.cache.set(login, { le: Date.now(), indicateurs });
      return indicateurs;
    } catch (e) {
      traduireErreurGithub(e);
    }
  }
}
