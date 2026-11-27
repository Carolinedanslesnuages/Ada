/** Write access of an author to a project, asked from GitHub and kept a few minutes (see trust.ts). */
import type { GithubService } from '../github/github.service.js';
import type { RepositoryTarget } from '../projects/repository.js';
import { writeAccess, trustedLink } from './trust.js';

type GithubClient = ReturnType<GithubService['client']>;

export class AuthorRights {
  constructor(private readonly target: (repository: string) => RepositoryTarget) {}

  /** “repository|login” → write access, kept 5 minutes (a failed call, 30 seconds). */
  private readonly rights = new Map<string, { written: boolean; expire: number }>();

  /** Can the account write to the project? Asked from GitHub; on error, no. */
  private async canWrite(gh: GithubClient, repository: string, login: string): Promise<boolean> {
    const { owner, repo } = this.target(repository);
    const key = `${owner}/${repo}|${login.toLowerCase()}`;
    const known = this.rights.get(key);
    if (known && known.expire > Date.now()) return known.written;
    let written = false;
    let duration = 5 * 60_000;
    try {
      const { data } = await gh.repos.getCollaboratorPermissionLevel({ owner, repo, username: login });
      written = writeAccess(data.role_name) || writeAccess(data.permission);
    } catch {
      duration = 30_000;
    }
    this.rights.set(key, { written, expire: Date.now() + duration });
    return written;
  }

  /** Trusted author (issue or comment): owner, or member/collaborator with write access. */
  async reliable(gh: GithubClient, repository: string, link: string | null | undefined, login: string | null | undefined): Promise<boolean> {
    const trust = trustedLink(link);
    if (trust !== 'to-check') return trust === 'trusted';
    return login ? this.canWrite(gh, repository, login) : false;
  }
}
