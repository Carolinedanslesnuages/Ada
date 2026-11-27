/**
 * Who may speak on behalf of the PO? Issues and their comments are public on a public repository,
 * and ADA rebuilds from them the agent's exchanges (“[PO] …”) and the PO's screen. A comment or
 * an issue written by an account without write access to the project must therefore never be
 * taken for an instruction: the agent would read orders in it, and the PO plans they would believe to be ADA's.
 *
 * GitHub gives the author's link with the repository (`author_association`), but this link does not tell
 * the right: an organization “member” or a “collaborator” may only have read
 * access. Only the owner is therefore trusted outright; for the others, ADA asks GitHub
 * for the actual permission level (`WRITE_PERMISSIONS`). ADA always writes under the PO's name (user
 * token): its messages carry the PO's own link.
 */
export type Link = 'trusted' | 'to-check' | 'denied';

/** Owner: trusted. Member or collaborator: to check. Anything else (or nothing): refused. */
export function trustedLink(link: string | null | undefined): Link {
  if (link === 'OWNER') return 'trusted';
  if (link === 'MEMBER' || link === 'COLLABORATOR') return 'to-check';
  return 'denied';
}

/** Permission levels that allow writing to the project (`triage` and `read` do not). */
const WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);

export const writeAccess = (level: string | null | undefined): boolean => WRITE_PERMISSIONS.has(String(level));

/** Why a request written by this account cannot be launched (told to the PO, in plain words). */
export const unknownAuthorReason = (login: string | null | undefined): string =>
  `elle a été écrite par ${login ?? 'un compte inconnu'}, qui n’a pas le droit d’écrire dans le projet : recopiez-la dans une nouvelle demande de votre compte`;
