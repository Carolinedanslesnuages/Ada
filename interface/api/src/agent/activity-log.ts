/**
 * Activity of a request (phase, activity feed, error, PR, last pushed commit), stored next to
 * the project preview. This is what the PO's screen shows while the agent is working.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Phase } from './agent.js';
import { writeAtomically } from './launch.js';
import { parseStored } from '../legacy/legacy-storage.js';

export interface Activity {
  phase: Phase | null;
  inProgress: boolean;
  start: string | null;
  log: { at: string; text: string }[];
  error: string | null;
  pullRequest: string | null;
  /** Conversation: agent session, resumed from one message to the next (keeping the thread). */
  session?: string | null;
  /**
   * Last commit of the branch as ADA pushed it. At merge time, a branch that moved forward
   * outside ADA (commits added by someone else) is no longer what the PO checked.
   */
  head?: string | null;
}

const EMPTY: Activity = { phase: null, inProgress: false, start: null, log: [], error: null, pullRequest: null };

export class ActivityLog {
  /** `agentFolder`: working folder of the agent for a project (next to its preview). */
  constructor(private readonly agentFolder: (repository: string) => string) {}

  private file(repository: string, number: number): string {
    return join(this.agentFolder(repository), `${number}.json`);
  }

  async read(repository: string, number: number): Promise<Activity> {
    try {
      return parseStored<Activity>(await readFile(this.file(repository, number), 'utf8'));
    } catch {
      return { ...EMPTY };
    }
  }

  async save(repository: string, number: number, update: Partial<Activity>): Promise<Activity> {
    const activity = { ...(await this.read(repository, number)), ...update };
    await mkdir(this.agentFolder(repository), { recursive: true });
    await writeAtomically(this.file(repository, number), JSON.stringify(activity, null, 2));
    return activity;
  }

  /** Adds a line to the activity feed (the last 60 are kept). */
  async record(repository: string, number: number, text: string): Promise<void> {
    const activity = await this.read(repository, number);
    const log = [...activity.log, { at: new Date().toISOString(), text }].slice(-60);
    await this.save(repository, number, { log });
  }
}
