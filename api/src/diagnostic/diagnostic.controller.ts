import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConnecteGuard } from '../auth/connecte.guard.js';
import { CONFIG, type Config } from '../config.js';
import { decrireErreurGithub } from '../github/erreurs.js';
import { GithubService } from '../github/github.service.js';
import { catalogue } from '../projets/modeles.js';

/**
 * Ce que la GitHub App peut réellement faire au nom du PO connecté.
 * Aucun secret : comptes, type d'accès, permissions accordées, visibilité des modèles.
 */
@Controller('diagnostic')
@UseGuards(ConnecteGuard)
export class DiagnosticController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
  ) {}

  @Get()
  async diagnostic(@Req() req: Request): Promise<unknown> {
    const gh = this.github.client(req.session.jeton!);
    const installations = await gh.apps
      .listInstallationsForAuthenticatedUser()
      .then(({ data }) =>
        data.installations.map((i) => ({
          compte: i.account && 'login' in i.account ? i.account.login : null,
          accesAuxDepots: i.repository_selection,
          permissions: i.permissions,
        })),
      )
      .catch((e: unknown) => ({ erreur: decrireErreurGithub(e) }));
    const modeles = await Promise.all(
      catalogue(this.config)
        .filter((m) => m.depot)
        .map(async (m) => {
          const [owner, repo] = m.depot!.split('/') as [string, string];
          return gh.repos
            .get({ owner, repo })
            .then(({ data }) => ({ depot: m.depot, visible: true, estUnModele: data.is_template, permissions: data.permissions }))
            .catch((e: unknown) => ({ depot: m.depot, visible: false, erreur: decrireErreurGithub(e) }));
        }),
    );
    return {
      utilisateur: req.session.utilisateur?.login,
      proprietaireDesProjets: this.config.GITHUB_PROPRIETAIRE,
      installations,
      modeles,
    };
  }
}
