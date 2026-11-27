import { Inject, Injectable } from '@nestjs/common';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CONFIG, type Config } from '../config.js';
import { parseIdentifier } from '../projects/repository.js';
import { STATUSES, type BugContent, type StoryContent, type Status, type WorkRequestType } from './story.js';
import { parseStored } from '../legacy/legacy-storage.js';

/**
 * The state of a request lives in ADA, not in GitHub. On GitHub, anyone with rights
 * on the repository can write a comment, change a label or edit an issue, and ADA writes with
 * the PO's token: nothing tells a message from ADA from one written by hand. ADA therefore keeps
 * by itself what matters to decide what it does:
 *  - the request as it was at launch (“frozen”): the agent never reads the live issue;
 *  - the log of what ADA and the PO told each other through the interface (never read back from GitHub);
 *  - the status (never read back from the labels).
 * GitHub receives a read copy (comments, labels) and the result: branches and PRs.
 *
 * Files under `apercus/<project>/demandes/` (outside git). The log is a file that is only
 * appended to: the API and the worker can write to it without stepping on each other.
 * This module is the only one that knows this storage: a database would replace it without touching the rest.
 */
export interface FrozenWorkRequest {
  number: number;
  title: string;
  type: WorkRequestType;
  content: StoryContent | null;
  bugContent: BugContent | null;
  freeContent: string | null;
  parent: number | null;
  launchedAt: string;
  launchedBy: string;
}

/** A message exchanged through ADA's interface, as it was published (exact text, ADA's marker included). */
export interface LogMessage {
  id: number;
  author: string;
  text: string;
  at: string;
}

const KNOWN_STATUSES = new Set<string>(['new', 'delivered', ...Object.keys(STATUSES)]);

@Injectable()
export class WorkRequestStore {
  constructor(@Inject(CONFIG) private readonly config: Pick<Config, 'PREVIEWS_DIR' | 'GITHUB_OWNER'>) {}

  private folder(repository: string): string {
    parseIdentifier(repository, this.config.GITHUB_OWNER); // well-formed identifier: never a path
    return join(resolve(this.config.PREVIEWS_DIR), repository.toLowerCase(), 'demandes');
  }

  private file(repository: string, number: number, suffix: string): string {
    if (!Number.isInteger(number) || number < 1) throw new Error(`Numéro de demande invalide : ${number}`);
    return join(this.folder(repository), `${number}.${suffix}`);
  }

  private async writeAtomically(filePath: string, content: string): Promise<void> {
    await mkdir(join(filePath, '..'), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, filePath);
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      return parseStored<T>(await readFile(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  // ---- The request frozen at launch -----------------------------------------------------------------

  async readFrozen(repository: string, number: number): Promise<FrozenWorkRequest | null> {
    return this.readJson<FrozenWorkRequest>(this.file(repository, number, 'demande.json'));
  }

  /** Freezes the request. A new launch (request put back on hold) replaces it; the log, however, goes on. */
  async freeze(repository: string, workRequest: FrozenWorkRequest): Promise<void> {
    await this.writeAtomically(this.file(repository, workRequest.number, 'demande.json'), JSON.stringify(workRequest, null, 2));
  }

  // ---- The log of the exchanges -------------------------------------------------------------------

  async addMessage(repository: string, number: number, message: { author: string; text: string }): Promise<void> {
    const filePath = this.file(repository, number, 'echanges.jsonl');
    await mkdir(join(filePath, '..'), { recursive: true });
    await appendFile(filePath, `${JSON.stringify({ ...message, at: new Date().toISOString() })}\n`);
  }

  /** The messages in order; `id` is their rank (1, 2, 3…). Missing log: empty list. */
  async messages(repository: string, number: number): Promise<LogMessage[]> {
    const text = await readFile(this.file(repository, number, 'echanges.jsonl'), 'utf8').catch(() => '');
    const messages: LogMessage[] = [];
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const { author, text: content, at } = parseStored<Omit<LogMessage, 'id'>>(line);
        if (typeof content === 'string') messages.push({ id: messages.length + 1, author: String(author ?? 'unknown'), text: content, at: String(at ?? '') });
      } catch {
        // damaged line (interrupted write): ignored
      }
    }
    return messages;
  }

  /** The log exists for this request: ADA already wrote to it (or recovered it from GitHub). */
  async hasLog(repository: string, number: number): Promise<boolean> {
    return (await this.messages(repository, number)).length > 0;
  }

  // ---- The status -------------------------------------------------------------------------------

  async readStatus(repository: string, number: number): Promise<Status | null> {
    const parsed = await this.readJson<{ status?: string }>(this.file(repository, number, 'statut.json'));
    return parsed?.status && KNOWN_STATUSES.has(parsed.status) ? (parsed.status as Status) : null;
  }

  async writeStatus(repository: string, number: number, status: Status): Promise<void> {
    await this.writeAtomically(this.file(repository, number, 'statut.json'), JSON.stringify({ status, at: new Date().toISOString() }));
  }

  /** Request delivered or abandoned: no current status any more. */
  async clearStatus(repository: string, number: number): Promise<void> {
    await rm(this.file(repository, number, 'statut.json'), { force: true });
  }

  // ---- Recovery of the statuses already set on GitHub before this change -------------------------

  /** The statuses read from the GitHub labels have already been recovered once for this project. */
  async areStatusesRecovered(repository: string): Promise<boolean> {
    return (await this.readJson<{ recoveredAt: string }>(join(this.folder(repository), 'statuts-repris.json'))) !== null;
  }

  async markStatusesRecovered(repository: string): Promise<void> {
    await this.writeAtomically(join(this.folder(repository), 'statuts-repris.json'), JSON.stringify({ recoveredAt: new Date().toISOString() }));
  }
}
