import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import session from 'express-session';
import { parseStored } from '../legacy/legacy-storage.js';

/**
 * Sessions on disk, encrypted (AES-256-GCM): an API restart no longer signs
 * anyone out, and the GitHub token is never written in clear. File named after the fingerprint
 * of the session identifier (the identifier itself appears nowhere on disk).
 */
export class EncryptedSessionStore extends session.Store {
  private readonly key: Buffer;

  constructor(
    private readonly folder: string,
    secret: string,
  ) {
    super();
    this.key = scryptSync(secret, 'atelier-po:sessions', 32);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
  }

  private filePath(sid: string): string {
    return join(this.folder, `${createHash('sha256').update(sid).digest('hex')}.json`);
  }

  encrypt(data: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const content = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return JSON.stringify({
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      content: content.toString('base64'),
    });
  }

  decrypt(text: string): session.SessionData {
    const { iv, tag, content } = parseStored<{ iv: string; tag: string; content: string }>(text);
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(content, 'base64')), decipher.final()]);
    return parseStored<session.SessionData>(plain.toString('utf8'));
  }

  override get(sid: string, reminder: (err: unknown, s?: session.SessionData | null) => void): void {
    readFile(this.filePath(sid), 'utf8')
      .then((text) => {
        const data = this.decrypt(text);
        const expire = data.cookie?.expires ? new Date(data.cookie.expires).getTime() : Infinity;
        if (expire < Date.now()) return this.destroy(sid, () => reminder(null, null));
        reminder(null, data);
      })
      // Missing, unreadable or forged (invalid GCM tag): no session.
      .catch(() => reminder(null, null));
  }

  override set(sid: string, data: session.SessionData, reminder?: (err?: unknown) => void): void {
    writeFile(this.filePath(sid), this.encrypt(data), { mode: 0o600 })
      .then(() => reminder?.())
      .catch((e: unknown) => reminder?.(e));
  }

  override destroy(sid: string, reminder?: (err?: unknown) => void): void {
    rm(this.filePath(sid), { force: true })
      .then(() => reminder?.())
      .catch((e: unknown) => reminder?.(e));
  }

  override touch(sid: string, data: session.SessionData, reminder?: () => void): void {
    this.set(sid, data, () => reminder?.());
  }
}
