import type { Octokit } from '@octokit/rest';
import { lastRun, isNotLaunched, checksState, runFromLink, type CheckRun, type Check } from './verification.js';

/**
 * Required checks of a commit, telling a real failure from a check GitHub refused to
 * run (billing): only the latter is explained to the PO as an account problem.
 */
export async function readChecks(gh: Octokit, owner: string, repo: string, sha: string, required: string[]): Promise<Check[]> {
  const { data } = await gh.checks.listForRef({ owner, repo, ref: sha, per_page: 100 });
  const runs = data.check_runs as CheckRun[];
  const checks = checksState(runs, required);
  return Promise.all(
    checks.map(async (check) => {
      const run = lastRun(runs, check.name);
      if (check.state !== 'failed' || !run?.id) return check;
      const { data: annotations } = await gh.checks.listAnnotations({ owner, repo, check_run_id: run.id }).catch(() => ({ data: [] }));
      return isNotLaunched(annotations.map((annotation) => annotation.message ?? '')) ? { ...check, state: 'not-launched' as const } : check;
    }),
  );
}

/** Reruns the failed or not-launched checks of a commit (once billing is fixed). */
export async function rerunChecks(gh: Octokit, owner: string, repo: string, sha: string): Promise<number> {
  const { data } = await gh.checks.listForRef({ owner, repo, ref: sha, per_page: 100 });
  const executions = new Set(
    (data.check_runs as CheckRun[])
      .filter((run) => run.status === 'completed' && run.conclusion !== 'success' && run.conclusion !== 'skipped')
      .map((run) => runFromLink(run.html_url))
      .filter((id): id is number => id !== null),
  );
  for (const run_id of executions) await gh.actions.reRunWorkflowFailedJobs({ owner, repo, run_id });
  return executions.size;
}
