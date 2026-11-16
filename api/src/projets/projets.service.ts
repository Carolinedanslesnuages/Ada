import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { traduireErreurGithub } from '../github/erreurs.js';

export interface Projet {
  nom: string;
  description: string | null;
  prive: boolean;
  url: string;
  misAJourLe: string | null;
}

@Injectable()
export class ProjetsService {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
  ) {}

  /** Dépôts du propriétaire (compte ou organisation) portant le topic de l'atelier. */
  async lister(jeton: string): Promise<Projet[]> {
    const q = `user:${this.config.GITHUB_PROPRIETAIRE} topic:${this.config.TOPIC_ATELIER}`;
    try {
      const { data } = await this.github.client(jeton).search.repos({ q, sort: 'updated', per_page: 100 });
      return data.items.map((d) => ({
        nom: d.name,
        description: d.description,
        prive: d.private,
        url: d.html_url,
        misAJourLe: d.updated_at ?? null,
      }));
    } catch (e) {
      traduireErreurGithub(e);
    }
  }
}
