import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ConflictException } from '@nestjs/common';
import type { PreviewService } from '../preview/preview.service.js';
import type { GithubService } from '../github/github.service.js';
import type { StoriesService } from '../stories/stories.service.js';
import type { ProjectsService } from '../projects/projects.service.js';
import { liveLock } from './lock.js';
import { AgentService } from './agent.service.js';
import { config, type FakePreview, TOKEN, prepareBench, projects, result } from './agent.bench.js';
import type { AgentLauncher } from './launch.js';

describe('AgentService — one agent per project, one waiting queue on the machine', () => {
  let root: string;
  let stories: ReturnType<typeof prepareBench>['stories'];
  let preview: FakePreview;
  let gh: ReturnType<typeof prepareBench>['gh'];
  let service: AgentService;
  let launch: ReturnType<typeof prepareBench>['launch'];
  let output: string[];
  let status: string;
  let commits = '1';

  beforeEach(() => {
    status = 'in-progress';
    commits = '1';
    output = [];
    ({ root, stories, preview, gh, service, launch } = prepareBench({ output: () => output, status: () => status, changeStatus: (created) => (status = created), commits: () => commits }));
  });

  it('does not launch two tasks at the same time on a project', async () => {
    let finish: ((code: number) => void) | null = null;
    service.launchAgent = () => new Promise((ok) => (finish = ok));
    await service.analyze(TOKEN, 'poc', 1);
    await expect(service.analyze(TOKEN, 'poc', 2)).rejects.toThrow(ConflictException);
    expect((await service.activeLock('poc'))?.number).toBe(1);
    await vi.waitFor(() => expect(finish).not.toBeNull());
    finish!(0);
    await service.lastTask;
    expect(await service.activeLock('poc')).toBeNull();
  });

  it('two simultaneous launches: only one task starts', async () => {
    let finish: ((code: number) => void) | null = null;
    service.launchAgent = () => new Promise((ok) => (finish = ok));
    const results = await Promise.allSettled([service.analyze(TOKEN, 'poc', 1), service.analyze(TOKEN, 'poc', 2)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && r.reason instanceof ConflictException)).toHaveLength(1);
    await vi.waitFor(() => expect(finish).not.toBeNull());
    finish!(0);
    await service.lastTask;
  });

  it('ignores the lock of a dead process (interrupted run)', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(root, 'poc', 'agent'), { recursive: true });
    await writeFile(join(root, 'poc', 'agent', 'verrou.json'), JSON.stringify({ pid: 999999, number: 1, phase: 'implementation' }));
    expect(await service.activeLock('poc')).toBeNull();
    output = [result('{"decision":"plan","text":"Plan."}')];
    await service.analyze(TOKEN, 'poc', 1);
    await service.lastTask;
    expect(status).toBe('plan-to-approve');
  });

  describe('lock of a project', () => {
    const writeLock = async (pid: number, ageMs = 0) => {
      const { mkdir, utimes, writeFile } = await import('node:fs/promises');
      const filePath = join(root, 'poc', 'agent', 'verrou.json');
      await mkdir(join(root, 'poc', 'agent'), { recursive: true });
      await writeFile(filePath, JSON.stringify({ pid, number: 1, phase: 'implementation' }));
      const date = new Date(Date.now() - ageMs);
      await utimes(filePath, date, date);
    };

    it('drops a lock whose process still exists but no longer beats (process number reused)', async () => {
      await writeLock(process.pid, 10 * 60_000);
      expect(await service.activeLock('poc')).toBeNull();
      output = [result('{"decision":"plan","text":"Plan."}')];
      await service.analyze(TOKEN, 'poc', 1);
      await service.lastTask;
      expect(status).toBe('plan-to-approve');
    });

    it('keeps a lock whose process still beats', async () => {
      await writeLock(process.pid, 5_000);
      expect((await service.activeLock('poc'))?.number).toBe(1);
      await expect(service.analyze(TOKEN, 'poc', 2)).rejects.toThrow(ConflictException);
    });

    it('two processes that find the same abandoned lock at the same time: only one takes over', async () => {
      await writeLock(999999);
      const other = new AgentService({ ...config(), PREVIEWS_DIR: root }, { client: () => gh } as unknown as GithubService, stories as unknown as StoriesService, preview as unknown as PreviewService, projects as unknown as ProjectsService);
      let released: ((code: number) => void) | null = null;
      const blocked: AgentLauncher = () => new Promise((ok) => (released = ok));
      service.launchAgent = blocked;
      other.launchAgent = blocked;
      const results = await Promise.allSettled([service.analyze(TOKEN, 'poc', 1), other.analyze(TOKEN, 'poc', 2)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected' && r.reason instanceof ConflictException)).toHaveLength(1);
      await vi.waitFor(() => expect(released).not.toBeNull());
      released!(0);
      await Promise.all([service.lastTask, other.lastTask]);
    });

    it('releases the lock and explains the failure if the start fails (preview cannot be woken)', async () => {
      preview.isAsleep.mockReturnValue(true);
      preview.start.mockRejectedValue(new Error('Docker ne répond pas'));
      await expect(service.analyze(TOKEN, 'poc', 1)).rejects.toThrow('Docker ne répond pas');
      expect(await service.activeLock('poc')).toBeNull();
      expect(await service.activity('poc', 1)).toMatchObject({ inProgress: false, error: 'Docker ne répond pas' });
      preview.isAsleep.mockReturnValue(false);
      output = [result('{"decision":"plan","text":"Plan."}')];
      await service.analyze(TOKEN, 'poc', 1); // the project did not stay “busy”
      await service.lastTask;
    });
  });

  describe('waiting queue: at most AGENT_MAX_CONCURRENT agents on the machine', () => {
    const busy = (...projects: string[]) => preview.projectsWithAgent.mockImplementation(async () => projects);

    it('queues the task when all agents are taken, without launching the agent', async () => {
      busy('a', 'b', 'c');
      await service.analyze(TOKEN, 'poc', 1);
      await service.lastTask;
      expect(launch).not.toHaveBeenCalled();
      expect(await service.activeLock('poc')).toBeNull();
      expect(await service.queued('poc', 1)).toBe(true);
      const activity = await service.activity('poc', 1);
      expect(activity.inProgress).toBe(true);
      expect(activity.log.at(-1)?.text).toMatch(/En file d’attente \(1ᵉ\)/);
    });

    it('a queued project is busy: no second task, no GitHub comment written for nothing', async () => {
      busy('a', 'b', 'c');
      await service.analyze(TOKEN, 'poc', 1);
      await expect(service.analyze(TOKEN, 'poc', 2)).rejects.toThrow(ConflictException);
      status = 'plan-to-approve';
      await expect(service.approvePlan(TOKEN, 'po1', 'poc', 1)).rejects.toThrow(ConflictException);
      expect(stories.reply).not.toHaveBeenCalled();
    });

    it('starts the task as soon as an agent is free, only once, and empties the queue', async () => {
      busy('a', 'b', 'c');
      output = [result('{"decision":"plan","text":"Plan."}')];
      await service.analyze(TOKEN, 'poc', 1);
      await service.processQueue();
      expect(launch).not.toHaveBeenCalled(); // still full
      busy('a', 'b');
      await service.processQueue();
      await service.lastTask;
      expect(launch).toHaveBeenCalledTimes(1);
      expect(status).toBe('plan-to-approve');
      expect(await service.queued('poc')).toBe(false);
      await service.processQueue();
      expect(launch).toHaveBeenCalledTimes(1);
    });

    it('respects the order of arrival: a single free slot, the oldest request goes first', async () => {
      busy('a', 'b', 'c');
      await service.analyze(TOKEN, 'premier', 1);
      await new Promise((ok) => setTimeout(ok, 5));
      await service.analyze(TOKEN, 'second', 2);
      expect((await service.activity('second', 2)).log.at(-1)?.text).toMatch(/\(2ᵉ\)/);
      // Two agents of other projects run elsewhere; the real locks of this test's projects count too.
      const locks = () => readdirSync(root).filter((project) => liveLock(join(root, project, 'agent', 'verrou.json')));
      preview.projectsWithAgent.mockImplementation(async () => ['a', 'b', ...locks()]);
      const started: string[] = [];
      const releases: ((code: number) => void)[] = [];
      launch.mockImplementation(async (_args, cwd) => {
        started.push(cwd);
        return new Promise<number>((ok) => releases.push(ok));
      });
      await service.processQueue();
      await vi.waitFor(() => expect(started).toHaveLength(1));
      expect(started).toEqual([join(root, 'premier', 'depot')]);
      expect(await service.queued('second', 2)).toBe(true);
      expect(await service.queued('premier')).toBe(false);
      releases[0]!(0);
      await service.lastTask;
    });

    it('drops a task that has waited too long (its token would have expired) and offers to relaunch', async () => {
      busy('a', 'b', 'c');
      await service.analyze(TOKEN, 'poc', 1);
      await service.processQueue(Date.now() + 31 * 60_000);
      expect(await service.queued('poc')).toBe(false);
      expect(launch).not.toHaveBeenCalled();
      expect(await service.activity('poc', 1)).toMatchObject({ inProgress: false, error: expect.stringContaining('Relancez-la') });
    });

    it('the waiting file (which contains the PO\'s token) is readable only by its owner', async () => {
      busy('a', 'b', 'c');
      await service.analyze(TOKEN, 'poc', 1);
      const { readdirSync, statSync } = await import('node:fs');
      const folder = join(root, '.file-attente');
      const [file] = readdirSync(folder);
      expect(statSync(join(folder, file!)).mode & 0o077).toBe(0);
      expect(statSync(folder).mode & 0o077).toBe(0);
    });
  });
});
