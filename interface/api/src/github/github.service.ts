import { Injectable } from '@nestjs/common';
import { Octokit } from '@octokit/rest';

/** Fabrique un client GitHub qui agit au nom du PO connecté. */
@Injectable()
export class GithubService {
  client(jeton: string): Octokit {
    return new Octokit({ auth: jeton, userAgent: 'ada' });
  }
}
