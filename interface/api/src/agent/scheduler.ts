/**
 * Scheduling of the agent tasks: only one per project (lock shared between processes), at
 * most AGENT_MAX_CONCURRENT on the whole machine, then a waiting queue. Each task runs in
 * a detached worker process, which outlives API restarts.
 */
import { ConflictException, type Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PreviewService } from '../preview/preview.service.js';
import type { Config } from '../config.js';
import type { Task } from './agent.js';
import type { WaitingQueue } from './waiting-queue.js';
import type { ActivityLog } from './activity-log.js';
import { launchDetached } from './launch.js';
import type { ProjectLock } from './project-lock.js';

const QUEUE_INTERVAL_MS = 5_000;
/** Beyond that, the waiting task is dropped: the PO's token would have expired. */
const MAX_WAIT_MS = 30 * 60_000;

export interface Collaborators {
  config: Config;
  preview: PreviewService;
  lock: ProjectLock;
  activityLog: ActivityLog;
  file: WaitingQueue;
  /** The work of a task, according to its phase (in this process). */
  work: (task: Task) => Promise<void>;
  /** Working folder of the agent for a project (task files, worker logs). */
  agentFolder: (repository: string) => string;
  log: Logger;
}

export class Scheduler {
  /**
   * True: each task runs in a detached worker process, which outlives
   * API restarts. False (tests, and in the worker itself): direct run.
   */
  usesSeparateWorker = !process.env.VITEST;
  /** Last background task launched (lets the tests wait for its end). */
  lastTask: Promise<void> = Promise.resolve();
  private chain: Promise<unknown> = Promise.resolve();
  private queueTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly c: Collaborators) {}

  /**
   * Free: no agent holds the project and no task is waiting for its turn there. To check BEFORE
   * writing anything to GitHub (comment, status): otherwise a refusal would leave the issue
   * “in progress” without an agent.
   */
  async checkFree(repository: string): Promise<void> {
    if ((await this.c.lock.active(repository)) || (await this.c.file.contains(repository))) throw new ConflictException('ADA travaille déjà sur ce projet');
  }

  /** Starts the task, or queues it if the machine already has enough agents at work. */
  async launch(task: Task): Promise<void> {
    await this.serialize(async () => {
      await this.checkFree(task.repository);
      if ((await this.runningAgents()) >= this.c.config.AGENT_MAX_CONCURRENT) {
        await this.enqueue(task);
        return;
      }
      await this.start(task);
    });
  }

  /** One decision at a time (count the agents, then take a slot): otherwise two simultaneous launches would exceed the cap. */
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async runningAgents(): Promise<number> {
    return (await this.c.preview.projectsWithAgent()).length;
  }

  /** Takes the project lock and launches the task; on failure, releases the lock (otherwise the project would stay “busy”). */
  private async start(task: Task): Promise<void> {
    await this.c.lock.acquire(task.repository, { pid: process.pid, number: task.number, phase: task.phase });
    try {
      // The agent runs its commands in the preview container: if it was asleep, it is woken up.
      this.c.preview.recordUse(task.repository);
      if (this.c.preview.isAsleep(task.repository)) await this.c.preview.start(task.token, task.repository);
      await this.c.activityLog.save(task.repository, task.number, {
        phase: task.phase,
        inProgress: true,
        start: new Date().toISOString(),
        error: null,
      });
      if (this.usesSeparateWorker) {
        await this.startWorker(task);
        return;
      }
      this.lastTask = this.run(task);
    } catch (e) {
      await this.c.lock.release(task.repository);
      // The PO's screen shows this error with “Relaunch ADA”: the issue does not stay “in progress” without an explanation.
      await this.c.activityLog.save(task.repository, task.number, { inProgress: false, error: (e as Error).message }).catch(() => undefined);
      throw e;
    }
  }

  // ---- Waiting queue: tasks waiting for an agent to be free ------------------------------------------------------

  startTimer(): void {
    if (!this.usesSeparateWorker) return;
    this.queueTimer = setInterval(() => void this.processQueue().catch((e: unknown) => this.c.log.warn(`Waiting queue: ${(e as Error).message}`)), QUEUE_INTERVAL_MS);
    this.queueTimer.unref();
  }

  stopTimer(): void {
    if (this.queueTimer) clearInterval(this.queueTimer);
  }

  private async enqueue(task: Task): Promise<void> {
    const rank = await this.c.file.append(task);
    await this.c.activityLog.save(task.repository, task.number, { phase: task.phase, inProgress: true, start: new Date().toISOString(), error: null });
    await this.c.activityLog.record(
      task.repository,
      task.number,
      `En file d’attente (${rank}ᵉ) : ADA termine d’abord les demandes d’autres projets, puis s’y met toute seule`,
    );
  }

  /**
   * Starts, in order of arrival, the waiting tasks as long as there is room. Called
   * every few seconds by the API. A task that has waited too long is
   * dropped (its token would have expired): the PO's screen then offers “Relaunch ADA”.
   */
  async processQueue(now = Date.now()): Promise<void> {
    for (const entry of await this.c.file.entries()) {
      const { task } = entry;
      const next = await this.serialize(async (): Promise<'full' | 'next'> => {
        if (await this.c.lock.active(task.repository)) return 'next';
        if (now - Date.parse(entry.at) > MAX_WAIT_MS) {
          await this.c.file.remove(entry);
          await this.c.activityLog.save(task.repository, task.number, { inProgress: false, error: 'ADA n’a pas pu s’y mettre à temps : trop de demandes en même temps. Relancez-la.' });
          await this.c.activityLog.record(task.repository, task.number, 'Attente trop longue : à relancer');
          return 'next';
        }
        if ((await this.runningAgents()) >= this.c.config.AGENT_MAX_CONCURRENT) return 'full';
        await this.c.file.remove(entry);
        await this.start(task).catch((e: unknown) => this.c.log.warn(`Queued task ${task.repository}#${task.number} not started: ${(e as Error).message}`));
        return 'next';
      });
      if (next === 'full') break;
    }
  }

  /**
   * Detached process: it outlives an API restart. The task (with the PO's token) is passed
   * to it through a file readable by the user only, which it deletes as soon as it is read.
   */
  private async startWorker(task: Task): Promise<void> {
    const folder = this.c.agentFolder(task.repository);
    await mkdir(folder, { recursive: true });
    const taskFile = join(folder, `tache-${task.number}-${Date.now()}.json`);
    await writeFile(taskFile, JSON.stringify(task), { mode: 0o600 });
    const pid = await launchDetached(join(import.meta.dirname, 'worker.js'), taskFile, join(folder, `${task.number}.worker.log`));
    await this.c.lock.apply(task.repository, { pid, number: task.number, phase: task.phase });
  }

  /** Runs the task in this process (worker, or tests) and keeps the activity up to date. */
  async run(task: Task): Promise<void> {
    const { repository, number, phase } = task;
    await this.c.lock.apply(repository, { pid: process.pid, number, phase });
    const stopHeartbeat = this.c.lock.beat(repository);
    try {
      await this.c.work(task);
      await this.c.activityLog.save(repository, number, { inProgress: false });
    } catch (e) {
      const message = (e as Error).message;
      this.c.log.warn(`Agent on ${repository}#${number} (${phase}): ${message}`);
      await this.c.activityLog.save(repository, number, { inProgress: false, error: message });
    } finally {
      stopHeartbeat();
      await this.c.lock.release(repository);
    }
  }
}
