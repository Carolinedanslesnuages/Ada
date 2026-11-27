/** Merge rules of an implemented request: pure functions. */
import { DEFAULT_ADA } from '../ada/ada-config.js';
import { isConventionalTitle } from '../versions/conventional.js';

/** “not-launched”: GitHub refused to run the check (account billing, minutes quota). */
export type CheckState = 'pending' | 'in-progress' | 'succeeded' | 'failed' | 'not-launched';

export interface Check {
  name: string;
  state: CheckState;
  link: string | null;
}

export interface Verification {
  pullRequest: { number: number; url: string; state: 'open' | 'merged' | 'closed' } | null;
  checks: Check[];
  mergeable: boolean;
  reason: string | null;
}

export type CheckRun = { id?: number; name: string; status: string; conclusion: string | null; html_url?: string | null; started_at?: string | null };

/**
 * The most recent run of a check. GitHub returns the “check runs” from most recent to
 * oldest, and a rerun check has several: the start date is compared, then the identifier.
 */
export function lastRun(runs: CheckRun[], name: string): CheckRun | undefined {
  return runs
    .filter((run) => run.name === name)
    .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? '') || (a.id ?? 0) - (b.id ?? 0))
    .at(-1);
}

/** State of the required checks, from the GitHub “check runs” of the last commit of the PR. */
export function checksState(runs: CheckRun[], required: string[] = DEFAULT_ADA.requiredChecks): Check[] {
  return required.map((name) => {
    const run = lastRun(runs, name);
    if (!run) return { name, state: 'pending', link: null };
    if (run.status !== 'completed') return { name, state: 'in-progress', link: run.html_url ?? null };
    const ok = run.conclusion === 'success';
    return { name, state: ok ? 'succeeded' : 'failed', link: run.html_url ?? null };
  });
}

/** The merge is possible only if the PR is open, without conflict, and every check is green. */
export function canMerge(
  pullRequestState: 'open' | 'merged' | 'closed',
  withoutConflict: boolean | null,
  checks: Check[],
  title: string,
): { mergeable: boolean; reason: string | null } {
  if (pullRequestState === 'merged') return { mergeable: false, reason: 'Déjà fusionnée' };
  if (pullRequestState === 'closed') return { mergeable: false, reason: 'La pull request a été fermée sans fusion' };
  if (!isConventionalTitle(title)) {
    return {
      mergeable: false,
      reason: `Le titre « ${title} » ne commence pas par « feat: » ou « fix: » : il décide du numéro de la prochaine version. Un développeur doit le corriger`,
    };
  }
  if (checks.some((c) => c.state === 'not-launched')) return { mergeable: false, reason: NOT_LAUNCHED_REASON };
  const failure = checks.find((c) => c.state === 'failed');
  if (failure) return { mergeable: false, reason: `Le contrôle « ${failure.name} » a échoué : la demande doit être corrigée` };
  if (checks.some((c) => c.state !== 'succeeded')) return { mergeable: false, reason: 'Contrôles en cours…' };
  if (withoutConflict === false) return { mergeable: false, reason: 'La pull request est en conflit avec le projet : un développeur doit intervenir' };
  if (withoutConflict === null) return { mergeable: false, reason: 'GitHub vérifie que la fusion est possible…' };
  return { mergeable: true, reason: null };
}

/** GitHub's message when it refuses to run a job (failed payment, spending limit reached). */
const NOT_LAUNCHED = /job was not started|spending limit|payments? (have|has) failed|billing/i;

export function isNotLaunched(annotations: string[]): boolean {
  return annotations.some((message) => NOT_LAUNCHED.test(message));
}

export const NOT_LAUNCHED_REASON =
  'GitHub n’a pas lancé les contrôles : le compte qui possède ce projet a atteint sa limite de dépense GitHub Actions, ou un paiement a échoué (GitHub → Settings → Billing & plans). Le code n’est pas en cause. Une fois réglé, cliquez sur « Relancer les contrôles ».';

/** Run (workflow run) of a check, from its address …/actions/runs/<id>/job/<id>. */
export function runFromLink(link: string | null | undefined): number | null {
  const m = link?.match(/\/actions\/runs\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function numberFromUrl(url: string | null): number | null {
  const m = url?.match(/\/pull\/(\d+)$/);
  return m ? Number(m[1]) : null;
}
