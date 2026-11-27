/** GitHub settings ADA makes at project creation (labels, squash merge, automatic versions). */
import type { Octokit } from '@octokit/rest';
import { WORKSHOP_LABELS } from './templates.js';

const status = (e: unknown) => (e as { status?: number }).status;

/**
 * Labels the issue forms depend on (they only set a label if it exists) and
 * the workshop statuses. A repository created from a template does not inherit its labels.
 */
export async function applyLabels(gh: Octokit, owner: string, repo: string): Promise<void> {
  for (const label of WORKSHOP_LABELS) {
    try {
      await gh.issues.createLabel({ owner, repo, ...label });
    } catch (e) {
      if (status(e) !== 422) throw e; // 422: the label already exists (e.g. “bug”)
    }
  }
}

/**
 * “Squash and merge” only: one commit per request, titled like the PR
 * (Conventional Commits for release-please); branches deleted after merging.
 */
export async function enforceSquash(gh: Octokit, owner: string, repo: string, warnUser: (message: string) => void): Promise<void> {
  try {
    await gh.repos.update({
      owner,
      repo,
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      delete_branch_on_merge: true,
      squash_merge_commit_title: 'PR_TITLE',
      squash_merge_commit_message: 'PR_BODY',
    });
  } catch (e) {
    warnUser(`Squash not enforced on ${repo} (${status(e)}): merges by ADA stay squashed`);
  }
}

/** Workflow permissions: read/write + PR creation (release-please). */
export async function allowReleasePlease(gh: Octokit, owner: string, repo: string, warnUser: (message: string) => void): Promise<'done' | 'to-do'> {
  try {
    await gh.request('PUT /repos/{owner}/{repo}/actions/permissions/workflow', {
      owner,
      repo,
      default_workflow_permissions: 'write',
      can_approve_pull_request_reviews: true,
    });
    return 'done';
  } catch (e) {
    warnUser(`Actions setting refused on ${repo} (${status(e)}): to be done by the PO`);
    return 'to-do';
  }
}
