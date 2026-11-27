import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { ConflictException } from '@nestjs/common';
import type { AgentService } from './agent.service.js';
import { action, type FakePreview, TOKEN, prepareBench, result } from './agent.bench.js';

describe('AgentService — implementation', () => {
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

  it('implements nothing until the plan is proposed', async () => {
    status = 'questions';
    await expect(service.approvePlan(TOKEN, 'po1', 'poc', 1)).rejects.toBeInstanceOf(ConflictException);
    expect(launch).not.toHaveBeenCalled();
  });

  it('after approval: implements on a branch, pushes with the PO\'s rights, opens the PR', async () => {
    status = 'plan-to-approve';
    output = [action('Edit', { file_path: '/x/front/src/views/HomeView.vue' }), result('{"result":"ok","summary":"La page Ma journée est prête."}')];
    await service.approvePlan(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    expect(stories.reply).toHaveBeenCalledWith(TOKEN, 'poc', 1, '✅ Plan validé par po1.');
    const tools = launch.mock.calls[0]![0];
    expect(tools.some((o) => o.includes('push'))).toBe(false);
    expect(preview.run).toHaveBeenCalledWith('git', expect.arrayContaining(['checkout', '-b', 'story/1-page-d-accueil', 'origin/main']));
    const push = preview.run.mock.calls.find(([, a]) => (a as string[]).includes('push'))!;
    expect((push[1] as string[]).join(' ')).not.toContain(TOKEN);
    expect(push[2]).toEqual({ env: { GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic secret' } });
    // The preview is restarted on the work (API included) before the PO reviews.
    expect(preview.restartApplication).toHaveBeenCalledWith('poc');
    expect(preview.restartApplication.mock.invocationCallOrder[0]).toBeLessThan(
      stories.changeStatus.mock.invocationCallOrder[stories.changeStatus.mock.calls.findIndex((call) => call[3] === 'in-review')]!,
    );
    expect(gh.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({ head: 'story/1-page-d-accueil', base: 'main', title: 'feat: Page d’accueil', body: expect.stringContaining('Closes #1') }),
    );
    expect(status).toBe('in-review');
    expect((await service.activity('poc', 1)).pullRequest).toBe('https://github.com/proprio/poc/pull/2');
  });

  it('blocks cleanly if the agent saved nothing, without pushing', async () => {
    status = 'plan-to-approve';
    commits = '0';
    output = [result('{"result":"ok","summary":"Fait."}')];
    await service.approvePlan(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    expect(preview.run.mock.calls.some(([, a]) => (a as string[]).includes('push'))).toBe(false);
    expect(status).toBe('needs-developer');
  });

  it('blocks if the agent reports a blocker', async () => {
    status = 'plan-to-approve';
    output = [result('{"result":"blocked","reason":"Les tests restent rouges"}')];
    await service.approvePlan(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    expect(stories.commentAsAssistant).toHaveBeenCalledWith(TOKEN, 'poc', 1, 'Besoin d’aide', expect.stringContaining('Les tests restent rouges'));
    expect(status).toBe('needs-developer');
  });

  it('sends nothing if a file reserved for developers changed (whatever the tool)', async () => {
    preview.run = vi.fn(async (_c: string, args: string[]) => ({
      stdout: args.includes('rev-list') ? '1\n' : args.includes('diff') ? 'src/App.vue\n.github/workflows/ci.yml\n' : args.includes('rev-parse') ? 'main\n' : '',
    }));
    status = 'plan-to-approve';
    output = [result('{"result":"ok","summary":"Fait."}')];
    await service.approvePlan(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    const calls = preview.run.mock.calls.map((call) => (call[1] as string[]).join(' '));
    expect(calls.some((call) => call.includes('push'))).toBe(false);
    expect(gh.pulls.create).not.toHaveBeenCalled();
    expect(status).toBe('needs-developer');
    expect(stories.commentAsAssistant).toHaveBeenCalledWith(TOKEN, 'poc', 1, 'Besoin d’aide', expect.stringContaining('.github/workflows/ci.yml'));
  });

  it('resumes the implementation (without a new analysis) if the plan had already been approved', async () => {
    status = 'plan-to-approve';
    service.launchAgent = async () => {
      throw new Error('coupure');
    };
    await service.approvePlan(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    expect((await service.activity('poc', 1)).error).toBe('coupure');
    service.launchAgent = launch;
    output = [result('{"result":"ok","summary":"Fait."}')];
    await service.relaunch(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    const instructions = launch.mock.calls.at(-1)![0][1]!;
    expect(instructions).toContain('PHASE : RÉALISATION');
    expect(status).toBe('in-review');
  });

  it('restores the package-lock.json files touched by npm, but refuses any other modification', async () => {
    status = 'plan-to-approve';
    let state = ' M api/package-lock.json\n';
    preview.run.mockImplementation(async (_c: string, args: string[]) => ({
      stdout: args.includes('rev-list') ? '1\n' : args.includes('status') ? state : '',
    }));
    output = [result('{"result":"ok","summary":"Fait."}')];
    await service.approvePlan(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    expect(preview.run).toHaveBeenCalledWith('git', expect.arrayContaining(['checkout', '--', 'api/package-lock.json']));
    expect(status).toBe('in-review');

    status = 'plan-to-approve';
    state = ' M api/package-lock.json\n M front/src/App.vue\n';
    await service.approvePlan(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    expect((await service.activity('poc', 1)).error).toMatch(/modifications non enregistrées/);
  });

  it('resumes the unsaved work of an interrupted run on the same branch', async () => {
    status = 'in-progress';
    await (await import('node:fs/promises')).mkdir(join(root, 'poc', 'agent'), { recursive: true });
    await (await import('node:fs/promises')).writeFile(join(root, 'poc', 'agent', '1.json'), JSON.stringify({ phase: 'implementation', inProgress: false, log: [], error: 'coupure', start: null, pullRequest: null }));
    preview.run.mockImplementation(async (_c: string, args: string[]) => ({
      stdout: args.includes('rev-list') ? '1\n' : args.includes('status') ? '?? front/src/__tests__/Barre.spec.ts\n' : args.includes('rev-parse') ? 'story/1-page-d-accueil\n' : '',
    }));
    output = [result('{"result":"ok","summary":"Fait."}')];
    await service.relaunch(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    const instructions = launch.mock.calls.at(-1)![0][1]!;
    expect(instructions).toContain('Reprise : une exécution précédente a été interrompue');
    expect(preview.run.mock.calls.some(([, a]) => (a as string[]).includes('-b'))).toBe(false);
    expect(status).toBe('in-review');
  });

  it('refuses unsaved modifications on another branch (two requests mixed up)', async () => {
    status = 'plan-to-approve';
    preview.run.mockImplementation(async (_c: string, args: string[]) => ({
      stdout: args.includes('status') ? ' M front/src/App.vue\n' : args.includes('rev-parse') ? 'story/9-autre\n' : '',
    }));
    output = [result('{"result":"ok","summary":"Fait."}')];
    await service.approvePlan(TOKEN, 'po1', 'poc', 1);
    await service.lastTask;
    expect((await service.activity('poc', 1)).error).toMatch(/modifications non enregistrées/);
    expect(launch).not.toHaveBeenCalled();
  });

  describe('the branch pushed by ADA is remembered (the merge refuses a commit from elsewhere)', () => {
    it('records the commit pushed after an implementation', async () => {
      preview.run.mockImplementation(async (_c: string, args: string[]) => ({
        stdout: args.includes('rev-list') ? '1\n' : args.includes('--abbrev-ref') ? 'main\n' : args.includes('rev-parse') ? 'f3a9c0de\n' : '',
      }));
      status = 'plan-to-approve';
      output = [result('{"result":"ok","summary":"Fait."}')];
      await service.approvePlan(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      expect((await service.activity('poc', 1)).head).toBe('f3a9c0de');
    });

    it('records none when nothing is pushed (blocked implementation)', async () => {
      status = 'plan-to-approve';
      output = [result('{"result":"blocked","reason":"Impossible."}')];
      await service.approvePlan(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      expect((await service.activity('poc', 1)).head).toBeUndefined();
    });
  });
});
