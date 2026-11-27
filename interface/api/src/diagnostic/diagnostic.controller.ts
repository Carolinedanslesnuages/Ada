import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { CONFIG, type Config } from '../config.js';
import { describeGithubError } from '../github/errors.js';
import { GithubService } from '../github/github.service.js';
import { ProjectsService } from '../projects/projects.service.js';

/**
 * What the GitHub App can really do on behalf of the signed-in PO.
 * No secret: accounts, access type, granted permissions, templates shipped in the catalog.
 */
@Controller('diagnostic')
@UseGuards(SignedInGuard)
export class DiagnosticController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly projects: ProjectsService,
  ) {}

  @Get()
  async diagnostic(@Req() req: Request): Promise<unknown> {
    const gh = this.github.client(req.session.token!);
    const installations = await gh.apps
      .listInstallationsForAuthenticatedUser()
      .then(({ data }) =>
        data.installations.map((i) => ({
          account: i.account && 'login' in i.account ? i.account.login : null,
          repositoryAccess: i.repository_selection,
          permissions: i.permissions,
        })),
      )
      .catch((e: unknown) => ({ error: describeGithubError(e) }));
    const templates = this.projects.templates().templates.map(({ id, available }) => ({ id, available }));
    return {
      user: req.session.user?.login,
      projectsOwner: this.config.GITHUB_OWNER,
      installations,
      templates,
    };
  }
}
