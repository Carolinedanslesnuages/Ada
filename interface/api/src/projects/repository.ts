import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * Identifier of a project in ADA (URL, preview folders, ports):
 * - `name` for a repository of the default owner (GITHUB_OWNER), as before the adoption;
 * - `account~name` for a repository of another account (PO's personal account, #37).
 * `~` exists neither in a login nor in a GitHub repository name: reading is unambiguous.
 * Everything is lowercase (GitHub ignores the case of names).
 */
export const SEPARATOR = '~';
const LOGIN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;
export const REPOSITORY_NAME = /^[a-z0-9][a-z0-9._-]{0,99}$/;

export interface RepositoryTarget {
  owner: string;
  repo: string;
}

export function projectIdentifier(owner: string, repo: string, defaultOwner: string): string {
  const account = owner.toLowerCase();
  const name = repo.toLowerCase();
  return account === defaultOwner.toLowerCase() ? name : `${account}${SEPARATOR}${name}`;
}

/** Owner and repo of an identifier; 400 if the identifier is malformed. */
export function parseIdentifier(id: string, defaultOwner: string): RepositoryTarget {
  const pieces = id.toLowerCase().split(SEPARATOR);
  const [owner, repo] = pieces.length === 1 ? [defaultOwner, pieces[0]] : pieces;
  if (pieces.length > 2 || !owner || !repo || !LOGIN.test(owner.toLowerCase()) || !REPOSITORY_NAME.test(repo)) {
    throw new BadRequestException('Projet inconnu');
  }
  return { owner, repo };
}

/**
 * Accounts whose projects a PO can open in ADA: ADA's organization and their own account.
 * The PO's GitHub rights apply on top (their token only opens what they can see).
 */
export function checkAccess(target: RepositoryTarget, login: string, defaultOwner: string): void {
  const allowed = [defaultOwner.toLowerCase(), login.toLowerCase()];
  if (!allowed.includes(target.owner.toLowerCase())) throw new ForbiddenException('Ce projet n’appartient ni à l’organisation ni à votre compte');
}

/** Name usable by docker compose (lowercase, digits, “-” and “_”). */
export function technicalName(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}
