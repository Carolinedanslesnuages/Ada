import { describe, expect, it } from 'vitest';
import { withLegacyEnv } from './legacy-env.js';
import { fromLegacyStorage, parseStored } from './legacy-storage.js';

describe('files stored before the switch to English', () => {
  it('reads a frozen request with its French fields and its “libre” type', () => {
    const stored = { numero: 4, titre: 'Mettre le titre en bleu', type: 'libre', contenu: null, contenuBug: null, contenuLibre: 'Mets le titre en bleu', parent: null, lanceeLe: '2026-11-19T17:49:00Z', lanceePar: 'po' };
    expect(fromLegacyStorage(stored)).toEqual({ number: 4, title: 'Mettre le titre en bleu', type: 'free', content: null, bugContent: null, freeContent: 'Mets le titre en bleu', parent: null, launchedAt: '2026-11-19T17:49:00Z', launchedBy: 'po' });
  });

  it('reads the content of a story and of a bug', () => {
    expect(fromLegacyStorage({ contenu: { role: 'agent', besoin: 'voir', benefice: 'savoir', criteres: ['un'] }, contenuBug: { constate: 'a', attendu: 'b', etapes: 'c', ecran: 'd' } })).toEqual({
      content: { role: 'agent', need: 'voir', benefit: 'savoir', criteria: ['un'] },
      bugContent: { observed: 'a', expected: 'b', steps: 'c', screen: 'd' },
    });
  });

  it('converts every former status, and keeps the ones that did not change', () => {
    const convert = (statut: string) => parseStored<{ status: string }>(JSON.stringify({ statut, le: '2026-11-19T17:49:00Z' })).status;
    expect(['en-cours', 'plan-a-valider', 'en-verification', 'besoin-dev', 'decoupage', 'attente', 'echange', 'questions', 'parent'].map(convert)).toEqual([
      'in-progress',
      'plan-to-approve',
      'in-review',
      'needs-developer',
      'breakdown',
      'waiting',
      'exchange',
      'questions',
      'parent',
    ]);
  });

  it('reads the activity of a request: phase, feed and last pushed commit', () => {
    const stored = { phase: 'realisation', enCours: false, debut: '2026-11-19T17:49:00Z', journal: [{ le: '2026-11-19T17:50:00Z', texte: 'Lit AGENTS.md' }], erreur: null, pullRequest: null, tete: 'f3a9c0de', session: null };
    expect(fromLegacyStorage(stored)).toEqual({ phase: 'implementation', inProgress: false, start: '2026-11-19T17:49:00Z', log: [{ at: '2026-11-19T17:50:00Z', text: 'Lit AGENTS.md' }], error: null, pullRequest: null, head: 'f3a9c0de', session: null });
  });

  it('reads the exchanges, the registry and the footprint log', () => {
    expect(fromLegacyStorage({ auteur: 'ADA', texte: 'Bonjour', le: '2026-11-19' })).toEqual({ author: 'ADA', text: 'Bonjour', at: '2026-11-19' });
    expect(fromLegacyStorage([{ id: 'poc', owner: 'po', repo: 'poc', origine: 'repris', le: '2026-11-19', par: 'po' }])).toEqual([{ id: 'poc', owner: 'po', repo: 'poc', origin: 'adopted', at: '2026-11-19', by: 'po' }]);
    expect(fromLegacyStorage({ le: '2026-11-19', projet: 'poc', numero: 1, phase: 'analyse', usages: [{ modele: 'claude-opus-5-5', tokensEntree: 10, tokensSortie: 20 }] })).toEqual({
      at: '2026-11-19',
      project: 'poc',
      number: 1,
      phase: 'analysis',
      usages: [{ model: 'claude-opus-5-5', inputTokenCount: 10, outputTokenCount: 20 }],
    });
  });

  it('leaves a file written with the current names untouched', () => {
    const current = { status: 'in-progress', at: '2026-11-27T10:00:00Z' };
    expect(fromLegacyStorage(current)).toEqual(current);
    expect(fromLegacyStorage({ statut: 'en-cours', status: 'delivered' })).toEqual({ status: 'delivered' });
  });
});

describe('environment variables named before the switch to English', () => {
  it('copies a former variable to its current name', () => {
    expect(withLegacyEnv({ GITHUB_PROPRIETAIRE: 'mon-orga', DOSSIER_APERCUS: '../apercus' })).toMatchObject({ GITHUB_OWNER: 'mon-orga', PREVIEWS_DIR: '../apercus' });
  });

  it('lets the current name win when both are set', () => {
    expect(withLegacyEnv({ AGENT_MODELE: 'haiku', AGENT_MODEL: 'opus' }).AGENT_MODEL).toBe('opus');
  });
});
