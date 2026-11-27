import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readConfig } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import type { ProjectsService } from '../projects/projects.service.js';
import { IndicatorsService } from './indicators.service.js';
import type { RegistryService } from './registry.service.js';

const config = readConfig({ GITHUB_OWNER: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32) });

describe('IndicatorsService', () => {
  const listForRepo = Symbol('listForRepo');
  const listEvents = Symbol('listEvents');
  const gh = { paginate: vi.fn(), issues: { listForRepo, listEvents }, repos: { get: vi.fn() } };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  const projects = { list: vi.fn() } as unknown as ProjectsService & { list: ReturnType<typeof vi.fn> };
  const registry = {
    record: vi.fn(async () => undefined),
    read: vi.fn(async () => [
      { id: 'ready', owner: 'proprio', repo: 'ready', origin: 'created', at: '', by: 'po' },
      { id: 'cleo', owner: 'proprio', repo: 'cleo', origin: 'unknown', at: '', by: null },
      { id: 'ancien', owner: 'proprio', repo: 'ancien', origin: 'created', at: '', by: 'po' },
      { id: 'po~repris', owner: 'po', repo: 'adopted', origin: 'adopted', at: '', by: 'po' },
      { id: 'autre~secret', owner: 'autre', repo: 'secret', origin: 'created', at: '', by: 'autre' },
    ]),
  };
  let service: IndicatorsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IndicatorsService(config, github, projects, registry as unknown as RegistryService);
    gh.repos.get.mockImplementation(async ({ repo }: { repo: string }) => {
      if (repo === 'cleo') throw Object.assign(new Error('absent'), { status: 404 });
      if (repo === 'ancien') return { data: { archived: true, topics: ['ada'] } };
      if (repo === 'adopted') return { data: { archived: false, topics: [] } };
      return { data: { archived: false, topics: ['ada'] } };
    });
    projects.list.mockResolvedValue([{ id: 'ready', name: 'ready', owner: 'proprio', adopted: false }]);
    gh.paginate.mockImplementation(async (method: unknown, options: { issue_number?: number }) => {
      if (method === listForRepo) {
        return [
          { number: 1, state: 'closed', closed_at: '2026-11-16T10:30:00Z', labels: [{ name: 'user-story' }], body: '' },
          { number: 2, state: 'open', labels: [{ name: 'user-story' }], body: '' },
          { number: 3, state: 'closed', closed_at: '2026-11-16T11:00:00Z', labels: [], body: 'question sans formulaire' },
          { number: 4, state: 'closed', labels: [{ name: 'user-story' }], pull_request: {} },
        ];
      }
      return options.issue_number === 1 ? [{ event: 'labeled', created_at: '2026-11-16T10:00:00Z', label: { name: 'story:en-cours' } }] : [];
    });
  });

  it('also counts archived, removed from ADA or deleted projects (registry), for this PO only', async () => {
    const indicators = await service.compute('token', 'po');
    expect(indicators.history).toEqual({ total: 4, created: 3, adopted: 1, active: 1, archives: 1, removed: 1, deleted: 1 });
    expect(registry.record).toHaveBeenCalledWith('ready', 'unknown', null);
    expect(gh.repos.get).not.toHaveBeenCalledWith(expect.objectContaining({ owner: 'autre' }));
  });

  it('computes from GitHub: only requests (neither PRs nor free issues) count', async () => {
    const indicators = await service.compute('token', 'po');
    expect(indicators).toMatchObject({ projects: 1, deliveredStories: 1, averageDurationMinutes: 30 });
    expect(indicators).not.toHaveProperty('partSansDev');
    expect(gh.paginate).toHaveBeenCalledWith(listForRepo, expect.objectContaining({ owner: 'proprio', repo: 'ready', state: 'all' }));
  });

  it('keeps the result for 5 minutes so as not to call GitHub at every display', async () => {
    await service.compute('token', 'po');
    const calls = gh.paginate.mock.calls.length;
    await service.compute('token', 'po');
    expect(gh.paginate.mock.calls.length).toBe(calls);
  });
});
