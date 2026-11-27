import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CONFIG, type Config } from '../config.js';
import { translateGithubError } from '../github/errors.js';
import { GithubService } from '../github/github.service.js';
import { parseIdentifier, checkAccess } from './repository.js';
import '../auth/session.js';

/** An access checked with GitHub stays valid for this long: the screen polling asks every 4 seconds. */
export const ACCESS_DURATION_MS = 60_000;
const MAX_CACHE_SIZE = 500;

/**
 * Every `projects/:repository/…` route: well-formed identifier, project of ADA's organization or of the
 * signed-in PO's account, AND repository that GitHub really shows to this PO (their token). The account
 * name alone is not enough: a private repository of the organization does not belong to all its members, and
 * several routes (agent activity, preview, footprint) make no GitHub call themselves.
 * To place after SignedInGuard.
 */
@Injectable()
export class ProjectGuard implements CanActivate {
  /** “login|account/repository” → expiry time. Only granted accesses are kept. */
  private readonly access = new Map<string, number>();

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpRequest = context.switchToHttp().getRequest<Request>();
    const id = String(httpRequest.params.repository ?? '');
    const target = parseIdentifier(id, this.config.GITHUB_OWNER);
    const login = httpRequest.session.user?.login ?? '';
    checkAccess(target, login, this.config.GITHUB_OWNER);

    const key = `${login.toLowerCase()}|${target.owner}/${target.repo}`;
    if ((this.access.get(key) ?? 0) > Date.now()) return true;
    try {
      await this.github.client(httpRequest.session.token ?? '').repos.get({ owner: target.owner, repo: target.repo });
    } catch (e) {
      translateGithubError(e); // 404 / 403: the repository is not visible to this PO
    }
    this.remember(key);
    return true;
  }

  private remember(key: string): void {
    const now = Date.now();
    if (this.access.size >= MAX_CACHE_SIZE) {
      for (const [other, expire] of this.access) if (expire <= now) this.access.delete(other);
      if (this.access.size >= MAX_CACHE_SIZE) this.access.clear();
    }
    this.access.set(key, now + ACCESS_DURATION_MS);
  }
}
