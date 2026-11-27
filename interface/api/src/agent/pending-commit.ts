/**
 * Work left uncommitted by the agent: ADA records it herself. Models weaker than Claude often finish the code,
 * the tests and the sheet but forget the last step (the commit); the work is not lost for that.
 */
import type { WorkRequest } from './agent.js';

/** Conventional Commits message of the work request (fix for a report, feat otherwise), closing the issue. */
export function pendingCommitMessage(workRequest: Pick<WorkRequest, 'number' | 'title' | 'type'>): string {
  const kind = workRequest.type === 'bug' ? 'fix' : 'feat';
  const title = workRequest.title.replace(/\s+/g, ' ').trim().slice(0, 72);
  return `${kind}: ${title}\n\nCloses #${workRequest.number}`;
}

/** Paths to record: everything, except the package-lock.json files that npm touches by itself when package.json did not change. */
export function pathsToRecord(modified: string[]): string[] {
  const packageChanged = modified.some((file) => file === 'package.json' || file.endsWith('/package.json'));
  return packageChanged ? modified : modified.filter((file) => !file.endsWith('package-lock.json'));
}
