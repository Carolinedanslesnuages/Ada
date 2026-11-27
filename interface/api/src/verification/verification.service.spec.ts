import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { readConfig } from '../config.js';
import type { AgentService } from '../agent/agent.service.js';
import type { PreviewService } from '../preview/preview.service.js';
import type { GithubService } from '../github/github.service.js';
import type { StoriesService } from '../stories/stories.service.js';
import type { DemoService } from '../demo/demo.service.js';
import { VerificationService } from './verification.service.js';
import { DEFAULT_ADA } from '../ada/ada-config.js';
import type { ProjectsService } from '../projects/projects.service.js';

const config = readConfig({ GITHUB_OWNER: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32) });
// Checks required by default (project without ada.json): all reported by GitHub.
const NAMES = [...DEFAULT_ADA.requiredChecks];
const runs = (conclusion: string | null, status = 'completed') => ({
  data: { check_runs: NAMES.map((name) => ({ name, status, conclusion, html_url: null })) },
});

describe('VerificationService', () => {
  const gh = {
    pulls: { get: vi.fn(), list: vi.fn(), merge: vi.fn(), updateBranch: vi.fn() },
    repos: { compareCommits: vi.fn(), getBranch: vi.fn() },
    checks: { listForRef: vi.fn() },
    issues: { update: vi.fn(), get: vi.fn() },
  };
  const agent = {
  activity: vi.fn(async (): Promise<{ pullRequest: string | null; head?: string | null }> => ({ pullRequest: 'https://github.com/proprio/poc/pull/3' })),
  recordHead: vi.fn(async () => undefined),
};
  const stories = { removeStatus: vi.fn(), reportDeliveryToParent: vi.fn(), detail: vi.fn(async () => ({ title: 'Page d’accueil', type: 'story' })) };
  const preview = { returnToMain: vi.fn(), restartApplication: vi.fn() };
  const demo = { update: vi.fn() };
  const projects = { readRepositoryConfig: vi.fn(async () => DEFAULT_ADA), enforcedChecks: vi.fn(async (): Promise<string[] | null> => null) };
  let service: VerificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    projects.enforcedChecks.mockResolvedValue(null);
    projects.readRepositoryConfig.mockResolvedValue(DEFAULT_ADA);
    agent.activity.mockResolvedValue({ pullRequest: 'https://github.com/proprio/poc/pull/3' });
    gh.issues.get.mockResolvedValue({ data: { state: 'open' } });
    gh.repos.compareCommits.mockResolvedValue({ data: { ahead_by: 0 } });
    gh.repos.getBranch.mockResolvedValue({ data: { commit: { sha: 'nouveau' } } });
    gh.pulls.get.mockResolvedValue({
      data: { number: 3, html_url: 'https://github.com/proprio/poc/pull/3', merged: false, state: 'open', mergeable: true, title: 'feat: Page d’accueil', head: { sha: 'abc', ref: 'story/1-page-d-accueil' }, base: { ref: 'main' } },
    });
    service = new VerificationService(
      config,
      { client: () => gh } as unknown as GithubService,
      agent as unknown as AgentService,
      stories as unknown as StoriesService,
      preview as unknown as PreviewService,
      projects as unknown as ProjectsService,
      demo as unknown as DemoService,
    );
  });

  it('shows the checks and allows the merge when everything is green', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    const v = await service.verify('token', 'poc', 1);
    expect(gh.checks.listForRef).toHaveBeenCalledWith(expect.objectContaining({ ref: 'abc' }));
    expect(v.pullRequest).toEqual({ number: 3, url: 'https://github.com/proprio/poc/pull/3', state: 'open' });
    expect(v.checks.map((c) => c.state)).toEqual(NAMES.map(() => 'succeeded'));
    expect(v.mergeable).toBe(true);
  });

  it('finds the pull request on GitHub by its branch when the local activity is gone', async () => {
    agent.activity.mockResolvedValueOnce({ pullRequest: null });
    gh.pulls.list.mockResolvedValue({ data: [{ number: 3 }] });
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    const v = await service.verify('token', 'poc', 1);
    expect(gh.pulls.list).toHaveBeenCalledWith(expect.objectContaining({ owner: 'proprio', repo: 'poc', head: 'proprio:story/1-page-d-accueil', state: 'all' }));
    expect(v.pullRequest?.number).toBe(3);
    expect(v.mergeable).toBe(true);
  });

  it('without a pull request, locally or on GitHub: says so', async () => {
    agent.activity.mockResolvedValueOnce({ pullRequest: null });
    gh.pulls.list.mockResolvedValue({ data: [] });
    expect(await service.verify('token', 'poc', 1)).toMatchObject({ pullRequest: null, mergeable: false, reason: 'Aucune pull request pour cette demande' });
  });

  it('refuses to merge while checks are running', async () => {
    gh.checks.listForRef.mockResolvedValue(runs(null, 'in_progress'));
    await expect(service.merge('token', 'poc', 1)).rejects.toThrow(ConflictException);
    expect(gh.pulls.merge).not.toHaveBeenCalled();
  });

  it('refuses to merge if a check failed', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('failure'));
    await expect(service.merge('token', 'poc', 1)).rejects.toThrow(/a échoué/);
    expect(gh.pulls.merge).not.toHaveBeenCalled();
  });

  it('merges into one Conventional Commits commit, closes the issue and puts the preview back on main', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    await service.merge('token', 'poc', 1);
    expect(gh.pulls.merge).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 3, sha: 'abc', merge_method: 'squash', commit_title: 'feat: Page d’accueil (#3)', commit_message: 'Closes #1' }),
    );
    expect(gh.issues.update).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 1, state: 'closed' }));
    expect(stories.removeStatus).toHaveBeenCalledWith('token', 'poc', 1);
    // Story from a breakdown: ticked in its parent request (#36).
    expect(stories.reportDeliveryToParent).toHaveBeenCalledWith('token', 'poc', 1);
    expect(preview.returnToMain).toHaveBeenCalledWith('token', 'poc');
    // The preview API is restarted: it serves the merged code, not an old version.
    expect(preview.restartApplication).toHaveBeenCalledWith('poc');
    // The demo link moves to the version that was just approved.
    expect(demo.update).toHaveBeenCalledWith('token', 'poc');
    expect(preview.returnToMain.mock.invocationCallOrder[0]).toBeLessThan(preview.restartApplication.mock.invocationCallOrder[0]!);
  });

  it('does not close again if “Closes #n” already closed the issue (no 500 error)', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    gh.issues.get.mockResolvedValue({ data: { state: 'closed' } });
    await expect(service.merge('token', 'poc', 1)).resolves.toBeDefined();
    expect(gh.issues.update).not.toHaveBeenCalled();
    expect(stories.removeStatus).toHaveBeenCalled();
    expect(preview.returnToMain).toHaveBeenCalled();
  });

  it('keeps cleaning up even if GitHub refuses the closing (closed in the meantime)', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    gh.issues.update.mockRejectedValueOnce({ status: 422, message: 'This issue was closed by another request' });
    await expect(service.merge('token', 'poc', 1)).resolves.toBeDefined();
    expect(stories.removeStatus).toHaveBeenCalled();
    expect(preview.returnToMain).toHaveBeenCalled();
  });

  it('first updates a branch that is behind main, without merging', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    gh.repos.compareCommits.mockResolvedValue({ data: { ahead_by: 2 } });
    const result = await service.merge('token', 'poc', 1);
    expect(gh.repos.compareCommits).toHaveBeenCalledWith(expect.objectContaining({ base: 'abc', head: 'main' }));
    expect(gh.pulls.updateBranch).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 3, expected_head_sha: 'abc' }));
    expect(gh.pulls.merge).not.toHaveBeenCalled();
    expect(result.mergeable).toBe(false);
    expect(result.reason).toMatch(/mise à jour et les contrôles sont relancés/);
    expect(agent.recordHead).toHaveBeenCalledWith('poc', 1, 'nouveau'); // the update comes from ADA: the new tip is its own
  });

  it('requires the checks of GitHub\'s protection rule, even if ada.json announces fewer', async () => {
    // ada.json (modifiable by others) would only ask for the leak check; GitHub's rule requires all three.
    projects.readRepositoryConfig.mockResolvedValue({ ...DEFAULT_ADA, requiredChecks: ['Anti-fuite (gitleaks)'] });
    projects.enforcedChecks.mockResolvedValue(NAMES);
    gh.checks.listForRef.mockResolvedValue({ data: { check_runs: [{ name: 'Anti-fuite (gitleaks)', status: 'completed', conclusion: 'success', html_url: null }] } });
    const verification = await service.verify('token', 'poc', 1);
    expect(verification.checks.map((check) => check.name)).toEqual(NAMES);
    expect(verification.mergeable).toBe(false);
  });

  it('without a protection rule, falls back to the checks of ada.json', async () => {
    projects.enforcedChecks.mockResolvedValue(null);
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    expect((await service.verify('token', 'poc', 1)).checks.map((check) => check.name)).toEqual(DEFAULT_ADA.requiredChecks);
  });

  describe('the branch is exactly what ADA pushed', () => {
    const pullRequest = 'https://github.com/proprio/poc/pull/3';

    it('refuses to merge if a commit was added to the branch outside ADA, even with green checks', async () => {
      agent.activity.mockResolvedValue({ pullRequest, head: 'sha-poussé-par-ada' });
      gh.checks.listForRef.mockResolvedValue(runs('success'));
      const verification = await service.verify('token', 'poc', 1);
      expect(verification.mergeable).toBe(false);
      expect(verification.reason).toMatch(/en dehors d’ADA/);
      await expect(service.merge('token', 'poc', 1)).rejects.toThrow(/en dehors d’ADA/);
      expect(gh.pulls.merge).not.toHaveBeenCalled();
    });

    it('allows the merge when the branch is at the commit pushed by ADA', async () => {
      agent.activity.mockResolvedValue({ pullRequest, head: 'abc' });
      gh.checks.listForRef.mockResolvedValue(runs('success'));
      expect((await service.verify('token', 'poc', 1)).mergeable).toBe(true);
    });

    it('compares nothing when ADA recorded no commit (request from before this change)', async () => {
      agent.activity.mockResolvedValue({ pullRequest, head: null });
      gh.checks.listForRef.mockResolvedValue(runs('success'));
      expect((await service.verify('token', 'poc', 1)).mergeable).toBe(true);
    });
  });

  it('considers the merge done even if the preview cannot be refreshed', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    preview.returnToMain.mockRejectedValueOnce(new Error('git occupé'));
    await expect(service.merge('token', 'poc', 1)).resolves.toBeDefined();
    expect(gh.pulls.merge).toHaveBeenCalled();
  });

  it('without a pull request: nothing to merge', async () => {
    agent.activity.mockResolvedValueOnce({ pullRequest: null });
    expect(await service.verify('token', 'poc', 1)).toEqual({
      pullRequest: null,
      checks: [],
      mergeable: false,
      reason: 'Aucune pull request pour cette demande',
    });
  });
});
