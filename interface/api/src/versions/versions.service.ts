import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { translateGithubError } from '../github/errors.js';
import { GithubService } from '../github/github.service.js';
import { readSummary, canPublish, VERSION_BRANCH_PREFIX, type Summary } from './versions.js';
import { parseIdentifier, type RepositoryTarget } from '../projects/repository.js';

export interface Versions {
  current: { version: string; url: string; at: string | null } | null;
  proposed: (Summary & { pullRequestNumber: number; url: string; publishable: boolean; reason: string | null }) | null;
}

@Injectable()
export class VersionsService {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
  ) {}

  /** GitHub account and repository of an ADA project (see projects/repository.ts). */
  private target(repository: string): RepositoryTarget {
    return parseIdentifier(repository, this.config.GITHUB_OWNER);
  }

  async read(token: string, repository: string): Promise<Versions> {
    const gh = this.github.client(token);
    try {
      const current = await gh.repos
        .getLatestRelease({ ...this.target(repository) })
        .then(({ data }) => ({ version: data.tag_name.replace(/^v/, ''), url: data.html_url, at: data.published_at ?? null }))
        .catch((e: unknown) => {
          if ((e as { status?: number }).status === 404) return null; // no published version
          throw e;
        });
      const { data: open } = await gh.pulls.list({ ...this.target(repository), state: 'open', per_page: 50 });
      const pr = open.find((p) => p.head.ref.startsWith(VERSION_BRANCH_PREFIX));
      if (!pr) return { current, proposed: null };
      const { data: files } = await gh.pulls.listFiles({ ...this.target(repository), pull_number: pr.number });
      return {
        current,
        proposed: {
          ...readSummary(pr.title, pr.body ?? ''),
          pullRequestNumber: pr.number,
          url: pr.html_url,
          ...canPublish(files.map((f) => f.filename)),
        },
      };
    } catch (e) {
      translateGithubError(e);
    }
  }

  /** Merges the version PR; release-please then creates the tag and the release page. */
  async publish(token: string, repository: string): Promise<Versions> {
    const versions = await this.read(token, repository);
    const proposed = versions.proposed;
    if (!proposed) throw new ConflictException('Aucune nouvelle version à publier');
    if (!proposed.publishable) throw new ConflictException(proposed.reason ?? 'Publication impossible');
    try {
      await this.github.client(token).pulls.merge({
        ...this.target(repository),
        pull_number: proposed.pullRequestNumber,
        merge_method: 'squash',
        commit_title: `chore(main): release ${proposed.version} (#${proposed.pullRequestNumber})`,
      });
    } catch (e) {
      translateGithubError(e);
    }
    return this.read(token, repository);
  }
}
