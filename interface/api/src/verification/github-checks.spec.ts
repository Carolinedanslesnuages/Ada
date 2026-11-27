import { describe, expect, it, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { readChecks, rerunChecks } from './github-checks.js';
import { isNotLaunched, runFromLink, canMerge, NOT_LAUNCHED_REASON } from './verification.js';

const BILLING =
  "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings";
const TITLE = 'Titre de PR (Conventional Commits, semver)';
const run = (id: number, conclusion: string, execution: number) => ({
  id,
  name: TITLE,
  status: 'completed',
  conclusion,
  html_url: `https://github.com/p/poc/actions/runs/${execution}/job/${id}`,
});

describe('checks that GitHub did not run (billing)', () => {
  it('recognizes GitHub\'s message, not a real failure', () => {
    expect(isNotLaunched([BILLING])).toBe(true);
    expect(isNotLaunched(['Process completed with exit code 1.'])).toBe(false);
  });

  it('finds the run to rerun from the check link', () => {
    expect(runFromLink('https://github.com/p/poc/actions/runs/44036388445/job/133880159636')).toBe(44036388445);
    expect(runFromLink(null)).toBeNull();
  });

  it('the merge waits, with an explanation that clears the code', () => {
    const result = canMerge('open', true, [{ name: TITLE, state: 'not-launched', link: null }], 'chore: reprise');
    expect(result).toEqual({ mergeable: false, reason: NOT_LAUNCHED_REASON });
    expect(NOT_LAUNCHED_REASON).toContain('Billing & plans');
  });

  it('reads the annotations of a failed check to tell “not launched” from “failed”', async () => {
    const gh = {
      checks: {
        listForRef: vi.fn(async () => ({ data: { check_runs: [run(1, 'failure', 10)] } })),
        listAnnotations: vi.fn(async () => ({ data: [{ message: BILLING }] })),
      },
    };
    expect(await readChecks(gh as unknown as Octokit, 'p', 'poc', 'sha', [TITLE])).toEqual([{ name: TITLE, state: 'not-launched', link: expect.any(String) }]);
    gh.checks.listAnnotations.mockResolvedValue({ data: [{ message: 'Process completed with exit code 1.' }] });
    expect((await readChecks(gh as unknown as Octokit, 'p', 'poc', 'sha', [TITLE]))[0]!.state).toBe('failed');
  });

  it('reruns each failed run once, never the successful ones', async () => {
    const gh = {
      checks: { listForRef: vi.fn(async () => ({ data: { check_runs: [run(1, 'failure', 10), run(2, 'failure', 10), run(3, 'success', 11), run(4, 'failure', 12)] } })) },
      actions: { reRunWorkflowFailedJobs: vi.fn(async () => ({})) },
    };
    expect(await rerunChecks(gh as unknown as Octokit, 'p', 'poc', 'sha')).toBe(2);
    expect(gh.actions.reRunWorkflowFailedJobs.mock.calls.map((call) => (call as unknown as [{ run_id: number }])[0].run_id)).toEqual([10, 12]);
  });
});
