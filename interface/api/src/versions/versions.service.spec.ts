import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { readConfig } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import { VersionsService } from './versions.service.js';

const config = readConfig({ GITHUB_OWNER: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32) });
const BODY = '### Features\n\n* Page d\'accueil ([#3](u)) ([c4a7c4c](u)), closes [#1](u)\n';

describe('VersionsService', () => {
  const gh = {
    repos: { getLatestRelease: vi.fn() },
    pulls: { list: vi.fn(), listFiles: vi.fn(), merge: vi.fn() },
  };
  let service: VersionsService;

  const versionPullRequest = { number: 4, title: 'chore(main): release 0.2.0', body: BODY, html_url: 'https://github.com/proprio/poc/pull/4', head: { ref: 'release-please--branches--main' } };

  beforeEach(() => {
    vi.clearAllMocks();
    gh.repos.getLatestRelease.mockRejectedValue({ status: 404 });
    gh.pulls.list.mockResolvedValue({ data: [{ number: 6, head: { ref: 'chore/noms' } }, versionPullRequest] });
    gh.pulls.listFiles.mockResolvedValue({ data: [{ filename: 'CHANGELOG.md' }, { filename: 'version.txt' }, { filename: '.release-please-manifest.json' }] });
    service = new VersionsService(config, { client: () => gh } as unknown as GithubService);
  });

  it('shows the proposed version with its summary, and that none is published yet', async () => {
    const versions = await service.read('token', 'poc');
    expect(versions.current).toBeNull();
    expect(versions.proposed).toMatchObject({
      version: '0.2.0',
      pullRequestNumber: 4,
      features: [{ text: 'Page d\'accueil', workRequest: 1 }],
      publishable: true,
    });
  });

  it('shows the current version when it exists', async () => {
    gh.repos.getLatestRelease.mockResolvedValue({ data: { tag_name: 'v0.1.0', html_url: 'https://github.com/proprio/poc/releases/tag/v0.1.0', published_at: '2026-11-16T10:00:00Z' } });
    gh.pulls.list.mockResolvedValue({ data: [] });
    expect(await service.read('token', 'poc')).toEqual({
      current: { version: '0.1.0', url: 'https://github.com/proprio/poc/releases/tag/v0.1.0', at: '2026-11-16T10:00:00Z' },
      proposed: null,
    });
  });

  it('publishes by merging the version PR', async () => {
    await service.publish('token', 'poc');
    expect(gh.pulls.merge).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 4, merge_method: 'squash', commit_title: 'chore(main): release 0.2.0 (#4)' }),
    );
  });

  it('refuses to publish a version PR that touches code', async () => {
    gh.pulls.listFiles.mockResolvedValue({ data: [{ filename: 'CHANGELOG.md' }, { filename: 'api/src/main.ts' }] });
    await expect(service.publish('token', 'poc')).rejects.toThrow(/api\/src\/main\.ts/);
    expect(gh.pulls.merge).not.toHaveBeenCalled();
  });

  it('refuses when there is nothing to publish', async () => {
    gh.pulls.list.mockResolvedValue({ data: [] });
    await expect(service.publish('token', 'poc')).rejects.toBeInstanceOf(ConflictException);
  });
});
