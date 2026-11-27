/**
 * Waiting queue of the tasks waiting for an agent to be free, outside any project. One entry
 * per project; it carries the PO's token: file readable by the user only.
 */
import { ConflictException } from '@nestjs/common';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Task } from './agent.js';
import { parseStored } from '../legacy/legacy-storage.js';

export interface QueueEntry {
  task: Task;
  at: string;
  file: string;
}

export class WaitingQueue {
  /** `folder`: folder of the queue (the leading dot of “.file-attente” keeps it out of the project lists). */
  constructor(private readonly folder: () => string) {}

  /** A single entry per project: its name identifies it, and its exclusive creation prevents any duplicate. */
  private file(repository: string): string {
    return join(this.folder(), `${Buffer.from(repository).toString('hex')}.json`);
  }

  private async read(file: string): Promise<QueueEntry | null> {
    try {
      return { ...parseStored<Omit<QueueEntry, 'file'>>(await readFile(file, 'utf8')), file };
    } catch {
      return null;
    }
  }

  /** The tasks waiting for their turn, in order of arrival. */
  async entries(): Promise<QueueEntry[]> {
    const names = await readdir(this.folder()).catch(() => [] as string[]);
    const entries = await Promise.all(names.filter((name) => name.endsWith('.json')).map((name) => this.read(join(this.folder(), name))));
    return entries.filter((entry): entry is QueueEntry => entry !== null).sort((a, b) => a.at.localeCompare(b.at));
  }

  /** A task of this project (and of this request, if given) is waiting for its turn. */
  async contains(repository: string, number?: number): Promise<boolean> {
    const entry = await this.read(this.file(repository));
    return entry !== null && (number === undefined || entry.task.number === number);
  }

  /** Queues the task; refuses if its project already has one. Returns its rank (1: the next one). */
  async append(task: Task): Promise<number> {
    await mkdir(this.folder(), { recursive: true, mode: 0o700 });
    try {
      // The task carries the PO's token: file readable by the user only, deleted when the task starts.
      await writeFile(this.file(task.repository), JSON.stringify({ task, at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ConflictException('ADA travaille déjà sur ce projet');
      throw error;
    }
    return (await this.entries()).findIndex((entry) => entry.task.repository === task.repository) + 1;
  }

  /** A task starts only once: its entry is removed before it starts. */
  async remove(entry: QueueEntry): Promise<void> {
    await rm(entry.file, { force: true });
  }
}
