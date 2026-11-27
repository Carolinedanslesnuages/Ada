import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type session from 'express-session';
import { EncryptedSessionStore } from './session-store.js';

const TOKEN = 'gho_jeton_du_po_a_ne_jamais_ecrire_en_clair';
const data = (expires: Date) =>
  ({ cookie: { expires, originalMaxAge: 1000 }, token: TOKEN, user: { login: 'po' } }) as unknown as session.SessionData;

const read = (m: EncryptedSessionStore, sid: string) =>
  new Promise<session.SessionData | null | undefined>((ok) => m.get(sid, (_e, s) => ok(s)));
const write = (m: EncryptedSessionStore, sid: string, s: session.SessionData) =>
  new Promise<void>((ok) => m.set(sid, s, () => ok()));

describe('Encrypted session store', () => {
  const created = () => {
    const folder = mkdtempSync(join(tmpdir(), 'sessions-'));
    return { folder, store: new EncryptedSessionStore(folder, 'x'.repeat(32)) };
  };

  it('finds the session again after a restart (new instance, same secret)', async () => {
    const { folder, store } = created();
    await write(store, 'sid-1', data(new Date(Date.now() + 60_000)));
    const afterRestart = new EncryptedSessionStore(folder, 'x'.repeat(32));
    expect((await read(afterRestart, 'sid-1'))?.token).toBe(TOKEN);
  });

  it('never writes the token or the session identifier in clear', async () => {
    const { folder, store } = created();
    await write(store, 'sid-secret', data(new Date(Date.now() + 60_000)));
    const [file] = readdirSync(folder);
    expect(file).not.toContain('sid-secret');
    expect(readFileSync(join(folder, file!), 'utf8')).not.toContain(TOKEN);
  });

  it('ignores a session modified on disk or encrypted with another secret', async () => {
    const { folder, store } = created();
    await write(store, 'sid-2', data(new Date(Date.now() + 60_000)));
    expect(await read(new EncryptedSessionStore(folder, 'y'.repeat(32)), 'sid-2')).toBeNull();
    const [file] = readdirSync(folder);
    const content = JSON.parse(readFileSync(join(folder, file!), 'utf8')) as { content: string };
    writeFileSync(join(folder, file!), JSON.stringify({ ...content, content: Buffer.from('falsifie').toString('base64') }));
    expect(await read(store, 'sid-2')).toBeNull();
  });

  it('forgets an expired session', async () => {
    const { folder, store } = created();
    await write(store, 'sid-3', data(new Date(Date.now() - 1000)));
    expect(await read(store, 'sid-3')).toBeNull();
    expect(readdirSync(folder)).toEqual([]);
  });
});
