import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lireConfig } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import type { ProjetsService } from '../projets/projets.service.js';
import { IndicateursService } from './indicateurs.service.js';

const config = lireConfig({ GITHUB_PROPRIETAIRE: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32) });

describe('IndicateursService', () => {
  const listForRepo = Symbol('listForRepo');
  const listEvents = Symbol('listEvents');
  const gh = { paginate: vi.fn(), issues: { listForRepo, listEvents } };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  const projets = { lister: vi.fn() } as unknown as ProjetsService & { lister: ReturnType<typeof vi.fn> };
  let service: IndicateursService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IndicateursService(config, github, projets);
    projets.lister.mockResolvedValue([{ nom: 'pret' }]);
    gh.paginate.mockImplementation(async (methode: unknown, options: { issue_number?: number }) => {
      if (methode === listForRepo) {
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

  it('calcule depuis GitHub : seules les demandes (pas les PR ni les issues libres) comptent', async () => {
    const indicateurs = await service.calculer('jeton', 'po');
    expect(indicateurs).toMatchObject({ projets: 1, storiesLivrees: 1, partSansDev: 1, dureeMoyenneMinutes: 30 });
    expect(gh.paginate).toHaveBeenCalledWith(listForRepo, expect.objectContaining({ owner: 'proprio', repo: 'pret', state: 'all' }));
  });

  it('garde le résultat 5 minutes pour ne pas solliciter GitHub à chaque affichage', async () => {
    await service.calculer('jeton', 'po');
    const appels = gh.paginate.mock.calls.length;
    await service.calculer('jeton', 'po');
    expect(gh.paginate.mock.calls.length).toBe(appels);
  });
});
