/** Lock of a project: only one agent at a time works in it, even across several processes. */
import { ConflictException } from '@nestjs/common';
import { mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeAtomically } from './launch.js';
import { LOCK_HEARTBEAT_MS, liveLock, type Lock } from './lock.js';

/** A takeover guard older than this comes from a process that died on the way: it is discarded. */
const MAX_HOLD_DURATION_MS = 10_000;

export class ProjectLock {
  /** `agentFolder`: working folder of the agent for a project (next to its preview). */
  constructor(private readonly agentFolder: (repository: string) => string) {}

  filePath(repository: string): string {
    return join(this.agentFolder(repository), 'verrou.json');
  }

  /** Lock of the project, if it is held by a live process that still beats (otherwise: leftover of an interrupted run). */
  async active(repository: string): Promise<Lock | null> {
    return liveLock(this.filePath(repository));
  }

  async apply(repository: string, lock: Lock): Promise<void> {
    await mkdir(this.agentFolder(repository), { recursive: true });
    await writeAtomically(this.filePath(repository), JSON.stringify(lock));
  }

  async release(repository: string): Promise<void> {
    await rm(this.filePath(repository), { force: true });
  }

  /** Sign of life: a lock that no longer beats is abandoned, even if its process number still exists. Returns the stop function. */
  beat(repository: string): () => void {
    const heartbeat = setInterval(() => {
      const now = new Date();
      void utimes(this.filePath(repository), now, now).catch(() => undefined);
    }, LOCK_HEARTBEAT_MS);
    heartbeat.unref();
    return () => clearInterval(heartbeat);
  }

  /**
   * Exclusive acquisition of the project lock: creation that fails if the file already exists. Replacing
   * an abandoned lock (dead process, or without heartbeat) is done under a takeover guard, also
   * created exclusively: only one process at a time checks there that the lock is really
   * dead, deletes it and takes its own. Without this guard, two tasks finding it dead together
   * could each delete the other's brand-new lock, and both work on the project.
   */
  async acquire(repository: string, lock: Lock): Promise<void> {
    const filePath = this.filePath(repository);
    const guard = `${filePath}.reprise`;
    await mkdir(this.agentFolder(repository), { recursive: true });
    const busy = () => new ConflictException('ADA travaille déjà sur ce projet');
    for (let trial = 0; trial < 40; trial++) {
      try {
        await writeFile(filePath, JSON.stringify(lock), { flag: 'wx' });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      if (await this.active(repository)) throw busy();
      try {
        await writeFile(guard, String(process.pid), { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // Another takeover is in progress; if its guard is old (process died on the way), it is removed.
        const age = Date.now() - (await stat(guard).then((file) => file.mtimeMs, () => Date.now()));
        if (age > MAX_HOLD_DURATION_MS) await rm(guard, { force: true });
        else await new Promise((ok) => setTimeout(ok, 25));
        continue;
      }
      try {
        if (await this.active(repository)) throw busy(); // another task took over in the meantime
        await rm(filePath, { force: true });
        await writeFile(filePath, JSON.stringify(lock), { flag: 'wx' });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw busy(); // a brand-new task took it
        throw error;
      } finally {
        await rm(guard, { force: true });
      }
    }
    throw busy();
  }
}
