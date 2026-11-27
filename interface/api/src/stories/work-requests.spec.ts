import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkRequestStore, type FrozenWorkRequest } from './work-requests.js';

const frozenRequest = (number: number, title = 'Une demande'): FrozenWorkRequest => ({
  number,
  title,
  type: 'story',
  content: { role: 'agent', need: 'voir', benefit: 'agir', criteria: ['c1'] },
  bugContent: null,
  freeContent: null,
  parent: null,
  launchedAt: '2026-11-18T10:00:00Z',
  launchedBy: 'po1',
});

describe('WorkRequestStore: the state of the requests, owned by ADA', () => {
  const created = () => {
    const root = mkdtempSync(join(tmpdir(), 'store-'));
    return { root, store: new WorkRequestStore({ PREVIEWS_DIR: root, GITHUB_OWNER: 'proprio' }) };
  };

  it('keeps the frozen request, the status and the log, per project and per number', async () => {
    const { store } = created();
    await store.freeze('poc', frozenRequest(2));
    await store.writeStatus('poc', 2, 'plan-to-approve');
    await store.addMessage('poc', 2, { author: 'po1', text: 'Bonjour' });
    expect(await store.readFrozen('poc', 2)).toMatchObject({ title: 'Une demande', content: { criteria: ['c1'] } });
    expect(await store.readStatus('poc', 2)).toBe('plan-to-approve');
    expect(await store.messages('poc', 2)).toMatchObject([{ id: 1, author: 'po1', text: 'Bonjour' }]);
    expect(await store.readFrozen('autre', 2)).toBeNull();
    expect(await store.readFrozen('poc', 3)).toBeNull();
    expect(await store.readStatus('poc', 3)).toBeNull();
  });

  it('refuses a project identifier or a number that would leave the folder', async () => {
    const { store } = created();
    await expect(store.readFrozen('../../etc', 1)).rejects.toThrow();
    await expect(store.addMessage('a/../b', 1, { author: 'x', text: 'y' })).rejects.toThrow();
    await expect(store.readStatus('poc', -1)).rejects.toThrow(/invalide/);
    await expect(store.readStatus('poc', 1.5)).rejects.toThrow(/invalide/);
  });

  it('messages written at the same time (API and worker) are all kept, in a stable order', async () => {
    const { store } = created();
    await Promise.all(Array.from({ length: 40 }, (_, rank) => store.addMessage('poc', 1, { author: 'ADA', text: `message ${rank}` })));
    const messages = await store.messages('poc', 1);
    expect(messages).toHaveLength(40);
    expect(new Set(messages.map((message) => message.text)).size).toBe(40);
    expect(messages.map((message) => message.id)).toEqual(Array.from({ length: 40 }, (_, rank) => rank + 1));
  });

  it('ignores a damaged line of the log (interrupted write) without losing the others', async () => {
    const { root, store } = created();
    await store.addMessage('poc', 1, { author: 'ADA', text: 'avant' });
    const folder = join(root, 'poc', 'demandes');
    const [file] = readdirSync(folder).filter((name) => name.endsWith('.jsonl'));
    writeFileSync(join(folder, file!), `${JSON.stringify({ author: 'ADA', text: 'avant', at: '' })}\n{"author":"ADA","tex\n${JSON.stringify({ author: 'ADA', text: 'après', at: '' })}\n`);
    expect((await store.messages('poc', 1)).map((message) => message.text)).toEqual(['avant', 'après']);
  });

  it('ignores an unknown status written in the file (never taken for a status)', async () => {
    const { root, store } = created();
    mkdirSync(join(root, 'poc', 'demandes'), { recursive: true });
    writeFileSync(join(root, 'poc', 'demandes', '1.statut.json'), JSON.stringify({ status: 'tout-autoriser' }));
    expect(await store.readStatus('poc', 1)).toBeNull();
  });

  it('a new launch replaces the frozen request but extends the log', async () => {
    const { store } = created();
    await store.freeze('poc', frozenRequest(2, 'Avant'));
    await store.addMessage('poc', 2, { author: 'po1', text: 'premier lancement' });
    await store.freeze('poc', frozenRequest(2, 'Après'));
    await store.addMessage('poc', 2, { author: 'po1', text: 'second lancement' });
    expect((await store.readFrozen('poc', 2))?.title).toBe('Après');
    expect((await store.messages('poc', 2)).map((message) => message.text)).toEqual(['premier lancement', 'second lancement']);
  });

  it('remembers that GitHub\'s statuses were recovered, only once per project', async () => {
    const { store } = created();
    expect(await store.areStatusesRecovered('poc')).toBe(false);
    await store.markStatusesRecovered('poc');
    expect(await store.areStatusesRecovered('poc')).toBe(true);
    expect(await store.areStatusesRecovered('autre')).toBe(false);
  });
});
