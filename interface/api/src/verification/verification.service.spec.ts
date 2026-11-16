import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { lireConfig } from '../config.js';
import type { AgentService } from '../agent/agent.service.js';
import type { ApercuService } from '../apercu/apercu.service.js';
import type { GithubService } from '../github/github.service.js';
import type { StoriesService } from '../stories/stories.service.js';
import { VerificationService } from './verification.service.js';

const config = lireConfig({ GITHUB_PROPRIETAIRE: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32) });
const NOMS = ['Anti-fuite (gitleaks)', 'API (lint, tests, compilation)', 'Front (lint, types, tests dont accessibilité, compilation)'];
const runs = (conclusion: string | null, status = 'completed') => ({
  data: { check_runs: NOMS.map((name) => ({ name, status, conclusion, html_url: null })) },
});

describe('VerificationService', () => {
  const gh = {
    pulls: { get: vi.fn(), merge: vi.fn(), updateBranch: vi.fn() },
    repos: { compareCommits: vi.fn() },
    checks: { listForRef: vi.fn() },
    issues: { update: vi.fn(), get: vi.fn() },
  };
  const agent = { activite: vi.fn(async (): Promise<{ pullRequest: string | null }> => ({ pullRequest: 'https://github.com/proprio/poc/pull/3' })) };
  const stories = { retirerStatut: vi.fn() };
  const apercu = { revenirSurMain: vi.fn() };
  let service: VerificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    gh.issues.get.mockResolvedValue({ data: { state: 'open' } });
    gh.repos.compareCommits.mockResolvedValue({ data: { ahead_by: 0 } });
    gh.pulls.get.mockResolvedValue({
      data: { number: 3, html_url: 'https://github.com/proprio/poc/pull/3', merged: false, state: 'open', mergeable: true, title: 'feat: Page d’accueil', head: { sha: 'abc' }, base: { ref: 'main' } },
    });
    service = new VerificationService(
      config,
      { client: () => gh } as unknown as GithubService,
      agent as unknown as AgentService,
      stories as unknown as StoriesService,
      apercu as unknown as ApercuService,
    );
  });

  it('montre les contrôles et autorise la fusion quand tout est vert', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    const v = await service.verifier('jeton', 'poc', 1);
    expect(gh.checks.listForRef).toHaveBeenCalledWith(expect.objectContaining({ ref: 'abc' }));
    expect(v.pullRequest).toEqual({ numero: 3, url: 'https://github.com/proprio/poc/pull/3', etat: 'ouverte' });
    expect(v.controles.map((c) => c.etat)).toEqual(['reussi', 'reussi', 'reussi']);
    expect(v.fusionnable).toBe(true);
  });

  it('refuse de fusionner tant que des contrôles tournent', async () => {
    gh.checks.listForRef.mockResolvedValue(runs(null, 'in_progress'));
    await expect(service.fusionner('jeton', 'poc', 1)).rejects.toThrow(ConflictException);
    expect(gh.pulls.merge).not.toHaveBeenCalled();
  });

  it('refuse de fusionner si un contrôle a échoué', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('failure'));
    await expect(service.fusionner('jeton', 'poc', 1)).rejects.toThrow(/a échoué/);
    expect(gh.pulls.merge).not.toHaveBeenCalled();
  });

  it('fusionne en un commit Conventional Commits, ferme l’issue et remet l’aperçu sur main', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    await service.fusionner('jeton', 'poc', 1);
    expect(gh.pulls.merge).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 3, merge_method: 'squash', commit_title: 'feat: Page d’accueil (#3)', commit_message: 'Closes #1' }),
    );
    expect(gh.issues.update).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 1, state: 'closed' }));
    expect(stories.retirerStatut).toHaveBeenCalledWith('jeton', 'poc', 1);
    expect(apercu.revenirSurMain).toHaveBeenCalledWith('jeton', 'poc');
  });

  it('ne refait pas la fermeture si « Closes #n » a déjà fermé l’issue (pas d’erreur 500)', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    gh.issues.get.mockResolvedValue({ data: { state: 'closed' } });
    await expect(service.fusionner('jeton', 'poc', 1)).resolves.toBeDefined();
    expect(gh.issues.update).not.toHaveBeenCalled();
    expect(stories.retirerStatut).toHaveBeenCalled();
    expect(apercu.revenirSurMain).toHaveBeenCalled();
  });

  it('continue le ménage même si GitHub refuse la fermeture (fermée entre-temps)', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    gh.issues.update.mockRejectedValueOnce({ status: 422, message: 'This issue was closed by another request' });
    await expect(service.fusionner('jeton', 'poc', 1)).resolves.toBeDefined();
    expect(stories.retirerStatut).toHaveBeenCalled();
    expect(apercu.revenirSurMain).toHaveBeenCalled();
  });

  it('met d’abord à jour une branche en retard sur main, sans fusionner', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    gh.repos.compareCommits.mockResolvedValue({ data: { ahead_by: 2 } });
    const resultat = await service.fusionner('jeton', 'poc', 1);
    expect(gh.repos.compareCommits).toHaveBeenCalledWith(expect.objectContaining({ base: 'abc', head: 'main' }));
    expect(gh.pulls.updateBranch).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 3, expected_head_sha: 'abc' }));
    expect(gh.pulls.merge).not.toHaveBeenCalled();
    expect(resultat.fusionnable).toBe(false);
    expect(resultat.raison).toMatch(/mise à jour et les contrôles sont relancés/);
  });

  it('considère la fusion faite même si l’aperçu ne peut pas être remis à jour', async () => {
    gh.checks.listForRef.mockResolvedValue(runs('success'));
    apercu.revenirSurMain.mockRejectedValueOnce(new Error('git occupé'));
    await expect(service.fusionner('jeton', 'poc', 1)).resolves.toBeDefined();
    expect(gh.pulls.merge).toHaveBeenCalled();
  });

  it('sans pull request : rien à fusionner', async () => {
    agent.activite.mockResolvedValueOnce({ pullRequest: null });
    expect(await service.verifier('jeton', 'poc', 1)).toEqual({
      pullRequest: null,
      controles: [],
      fusionnable: false,
      raison: 'Aucune pull request pour cette demande',
    });
  });
});
