import { Injectable } from '@nestjs/common';
import { retry } from '@octokit/plugin-retry';
import { Octokit } from '@octokit/rest';

/**
 * GitHub client with automatic retries on transient errors (network
 * outage, 5xx errors): a slow connection must not make a project creation fail.
 * Substantive errors (400, 401, 403, 404, 422) are never retried.
 */
const OctokitWithRetry = Octokit.plugin(retry);

/** Builds a GitHub client that acts on behalf of the signed-in PO. */
@Injectable()
export class GithubService {
  client(token: string): Octokit {
    return new OctokitWithRetry({ auth: token, userAgent: 'ada', retry: { retries: 3 } }) as unknown as Octokit;
  }
}
