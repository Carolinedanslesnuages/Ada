import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { traduireErreurGithub } from '../github/erreurs.js';
import { GithubService } from '../github/github.service.js';
import { ProjetsService } from '../projets/projets.service.js';
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
  ) {}

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
      const indicateurs = calculerIndicateurs(mesures);
      this.cache.set(login, { le: Date.now(), indicateurs });
      return indicateurs;
    } catch (e) {
      traduireErreurGithub(e);
    }
  }
}
