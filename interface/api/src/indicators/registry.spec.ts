import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../config.js';
import { summary, save, projectState, type RegistryEntry } from './registry.js';
import { RegistryService } from './registry.service.js';

const entry = (id: string, origin: RegistryEntry['origin']): RegistryEntry => ({ id, owner: 'proprio', repo: id, origin, at: '2026-11-16T10:00:00Z', by: null });

describe('project registry', () => {
  it('only grows; a trace of unknown origin is completed as soon as it is known', () => {
    const registry = save([entry('poc', 'unknown')], entry('poc', 'created'));
    expect(registry).toEqual([{ ...entry('poc', 'created') }]);
    expect(save(registry, entry('poc', 'adopted'))).toBe(registry);
    expect(save(registry, entry('autre', 'adopted'))).toHaveLength(2);
  });

  it('state according to GitHub: active, archived, removed from ADA, deleted', () => {
    expect(projectState({ archived: false, topics: ['ada'] }, 'ada')).toBe('active');
    expect(projectState({ archived: true, topics: ['ada'] }, 'ada')).toBe('archived');
    expect(projectState({ archived: false, topics: [] }, 'ada')).toBe('removed');
    expect(projectState(null, 'ada')).toBe('deleted');
  });

  it('summary: created (unknown origin included) and adopted, by state', () => {
    expect(summary([{ origin: 'created', state: 'active' }, { origin: 'unknown', state: 'deleted' }, { origin: 'adopted', state: 'archived' }])).toEqual({
      total: 3, created: 2, adopted: 1, active: 1, archives: 1, removed: 0, deleted: 1,
    });
  });

  it('first start: seeded with the projects that had a preview, then completed along the way', async () => {
    const root = mkdtempSync(join(tmpdir(), 'registre-'));
    for (const project of ['pret-de-materiel', 'cleo', 'un-po~mon-poc']) mkdirSync(join(root, 'apercus', project), { recursive: true });
    const config = readConfig({ GITHUB_OWNER: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32), PREVIEWS_DIR: join(root, 'apercus'), REGISTRY_DIR: join(root, 'registre') });
    const service = new RegistryService(config);
    expect((await service.read()).map((line) => [line.id, line.owner, line.origin]).sort((first, second) => first[0]!.localeCompare(second[0]!))).toEqual([
      ['cleo', 'proprio', 'unknown'],
      ['pret-de-materiel', 'proprio', 'unknown'],
      ['un-po~mon-poc', 'un-po', 'unknown'],
    ]);
    await service.record('signalements', 'created', 'po');
    await service.record('cleo', 'created', 'po');
    const file = JSON.parse(readFileSync(join(root, 'registre', 'projets.json'), 'utf8')) as RegistryEntry[];
    expect(file.find((line) => line.id === 'signalements')).toMatchObject({ origin: 'created', by: 'po' });
    expect(file.find((line) => line.id === 'cleo')).toMatchObject({ origin: 'created' });
  });
});
