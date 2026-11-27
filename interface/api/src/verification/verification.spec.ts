import { describe, it, expect } from 'vitest';
import { checksState, numberFromUrl, canMerge } from './verification.js';

const required = ['Anti-fuite', 'API', 'Front'];
const run = (name: string, status: string, conclusion: string | null) => ({ name, status, conclusion, html_url: `https://x/${name}` });

describe('Checks of a pull request', () => {
  it('gives the state of every required check, including those not started yet', () => {
    expect(checksState([run('Anti-fuite', 'completed', 'success'), run('API', 'in_progress', null)], required)).toEqual([
      { name: 'Anti-fuite', state: 'succeeded', link: 'https://x/Anti-fuite' },
      { name: 'API', state: 'in-progress', link: 'https://x/API' },
      { name: 'Front', state: 'pending', link: null },
    ]);
  });

  it('keeps the most recent run of a rerun check, whatever GitHub\'s order', () => {
    const previous = { ...run('API', 'completed', 'failure'), id: 1, started_at: '2026-11-20T15:50:47Z' };
    const retry = { ...run('API', 'completed', 'success'), id: 2, started_at: '2026-11-20T15:57:27Z' };
    // GitHub lists the most recent first: it is the actual order that made the failure stick.
    expect(checksState([retry, previous], ['API'])[0]!.state).toBe('succeeded');
    expect(checksState([previous, retry], ['API'])[0]!.state).toBe('succeeded');
    // Without a date (old tests, fake GitHub): the identifier breaks the tie.
    expect(checksState([{ ...run('API', 'completed', 'failure'), id: 1 }, { ...run('API', 'completed', 'success'), id: 2 }], ['API'])[0]!.state).toBe('succeeded');
  });
});

describe('Can it be merged?', () => {
  const TITLE = 'feat: Page d’accueil';
  const green = checksState(required.map((n) => run(n, 'completed', 'success')), required);

  it('yes: PR open, no conflict, everything is green', () => {
    expect(canMerge('open', true, green, TITLE)).toEqual({ mergeable: true, reason: null });
  });

  it('no while a check is running', () => {
    const inProgress = checksState([...required.slice(0, 2).map((n) => run(n, 'completed', 'success')), run('Front', 'queued', null)], required);
    expect(canMerge('open', true, inProgress, TITLE)).toEqual({ mergeable: false, reason: 'Contrôles en cours…' });
  });

  it('no if a check failed, naming it', () => {
    const red = checksState([run('Anti-fuite', 'completed', 'success'), run('API', 'completed', 'failure'), run('Front', 'completed', 'success')], required);
    expect(canMerge('open', true, red, TITLE).reason).toMatch(/« API » a échoué/);
  });

  it('no in case of conflict, or as long as GitHub does not know', () => {
    expect(canMerge('open', false, green, TITLE).reason).toMatch(/conflit/);
    expect(canMerge('open', null, green, TITLE).reason).toMatch(/vérifie/);
  });

  it('no if the title does not follow Conventional Commits: it decides the version (semver)', () => {
    expect(canMerge('open', true, green, 'Page d’accueil').reason).toMatch(/feat: » ou « fix: »/);
    expect(canMerge('open', true, green, 'Merge pull request #6').mergeable).toBe(false);
  });

  it('no if already merged or closed', () => {
    expect(canMerge('merged', true, green, TITLE).mergeable).toBe(false);
    expect(canMerge('closed', true, green, TITLE).mergeable).toBe(false);
  });

  it('finds the PR number from its address', () => {
    expect(numberFromUrl('https://github.com/p/poc/pull/3')).toBe(3);
    expect(numberFromUrl(null)).toBeNull();
  });
});
