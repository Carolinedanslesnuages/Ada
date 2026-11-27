import { readFileSync, statSync } from 'node:fs';

/** A task of the agent holds the lock of its project: only one at a time per project. */
export interface Lock {
  pid: number;
  number: number;
  phase: string;
}

/** The process holding the lock “touches” it at this rate: proof that it is still working. */
export const LOCK_HEARTBEAT_MS = 30_000;
/**
 * Without a heartbeat since this delay, the lock is abandoned even if its process number still
 * exists: after a machine restart, this number may have been given to a completely different
 * process, and the project would stay “busy” forever.
 */
export const LOCK_EXPIRY_MS = 4 * LOCK_HEARTBEAT_MS;

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Lock of the file, if it is held by a live process that recently gave a sign of life. */
export function liveLock(filePath: string, now = Date.now()): Lock | null {
  try {
    const lock = JSON.parse(readFileSync(filePath, 'utf8')) as Lock;
    if (!lock.pid || !isProcessAlive(lock.pid)) return null;
    return now - statSync(filePath).mtimeMs <= LOCK_EXPIRY_MS ? lock : null;
  } catch {
    return null;
  }
}
