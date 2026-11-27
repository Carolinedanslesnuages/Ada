import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { readConfig } from '../config.js';
import { PreviewService, SLEEP_DELAY_MS, type Runner } from './preview.service.js';

const TOKEN = 'jeton-secret-du-po';

describe('PreviewService', () => {
  let root: string;
  let service: PreviewService;
  let run: ReturnType<typeof vi.fn<Runner>>;
  let currentBranch = 'main';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'apercus-'));
    service = new PreviewService(
      readConfig({
        GITHUB_OWNER: 'proprio',
        GITHUB_CLIENT_ID: 'Iv',
        GITHUB_CLIENT_SECRET: 's',
        SESSION_SECRET: 'x'.repeat(32),
        PREVIEWS_DIR: root,
      }),
    );
    run = vi.fn<Runner>(async (command, args) => {
      // Like the real “git clone --separate-git-dir”: separate git folder, and a plain .git file in the repository.
      if (command === 'git' && args[0] === 'clone') {
        const repository = args.at(-1)!;
        const gitFolder = args[args.indexOf('--separate-git-dir') + 1]!;
        mkdirSync(repository, { recursive: true });
        mkdirSync(gitFolder, { recursive: true });
        writeFileSync(join(repository, '.git'), `gitdir: ${gitFolder}\n`);
      }
      if (args.includes('ps')) return { stdout: JSON.stringify({ Service: 'app', State: 'running' }) };
      if (args.includes('rev-parse')) return { stdout: currentBranch + '\n' };
      return { stdout: '' };
    });
    service.run = run;
    service.responds = async () => true;
  });

  it('clones the repository with the PO\'s rights, never putting the token in the arguments', async () => {
    const preview = await service.start(TOKEN, 'poc-portail');
    const clone = run.mock.calls.find(([c, a]) => c === 'git' && a[0] === 'clone')!;
    // The git folder is stored next to the repository, outside the folder mounted in the preview container.
    expect(clone[1]).toEqual(['clone', '--quiet', '--separate-git-dir', join(root, 'poc-portail', 'git'), 'https://github.com/proprio/poc-portail.git', join(root, 'poc-portail', 'depot')]);
    expect(statSync(join(root, 'poc-portail', 'depot', '.git')).isFile()).toBe(true);
    for (const [, args] of run.mock.calls) expect(args.join(' ')).not.toContain(TOKEN);
    const header = clone[2]!.env!.GIT_CONFIG_VALUE_0!;
    expect(Buffer.from(header.replace('AUTHORIZATION: basic ', ''), 'base64').toString()).toBe(`x-access-token:${TOKEN}`);
    expect(preview).toEqual({ state: 'ready', url: 'http://localhost:5300', log: null });
  });

  it('writes the container files then starts them', async () => {
    await service.start(TOKEN, 'poc-portail');
    expect(readFileSync(join(root, 'poc-portail', 'compose.yml'), 'utf8')).toContain('"127.0.0.1:5300:5173"');
    expect(existsSync(join(root, 'poc-portail', 'demarrer.sh'))).toBe(true);
    expect(existsSync(join(root, 'poc-portail', 'travail.sh'))).toBe(true);
    expect(run).toHaveBeenCalledWith('docker', ['volume', 'create', 'atelier-po-cache-npm']);
    expect(run).toHaveBeenCalledWith('docker', ['compose', '-f', 'compose.yml', 'up', '-d', '--remove-orphans'], {
      cwd: join(root, 'poc-portail'),
    });
  });

  it('updates an already cloned repository (on main) instead of cloning it again', async () => {
    currentBranch = 'main';
    await service.start(TOKEN, 'poc-portail');
    run.mockClear();
    await service.start(TOKEN, 'poc-portail');
    expect(run.mock.calls.some(([c, a]) => c === 'git' && a.includes('fetch'))).toBe(true);
    expect(run.mock.calls.some(([c, a]) => c === 'git' && a.includes('origin/main'))).toBe(true);
    expect(run.mock.calls.some(([c, a]) => c === 'git' && a[0] === 'clone')).toBe(false);
  });

  it('does not touch the work in progress when the repository is on a story branch', async () => {
    await service.start(TOKEN, 'poc-portail');
    currentBranch = 'story/1-accueil';
    run.mockClear();
    await service.start(TOKEN, 'poc-portail');
    expect(run.mock.calls.some(([c, a]) => c === 'git' && a.includes('fetch'))).toBe(true);
    expect(run.mock.calls.some(([c, a]) => c === 'git' && a.includes('origin/main'))).toBe(false);
    currentBranch = 'main';
  });

  it('gives each project a different port, and keeps it', async () => {
    await service.start(TOKEN, 'poc-portail');
    const other = await service.start(TOKEN, 'annuaire');
    expect(other.url).toBe('http://localhost:5301');
    expect((await service.start(TOKEN, 'poc-portail')).url).toBe('http://localhost:5300');
  });

  it('is “stopped” as long as it has never been started', async () => {
    expect(await service.state('jamais-lance')).toEqual({ state: 'stopped', url: null, log: null });
  });

  it('stays “starting” as long as the application does not respond', async () => {
    service.responds = async () => false;
    const preview = await service.start(TOKEN, 'poc-portail');
    expect(preview.state).toBe('starting');
    expect(preview.url).toBeNull();
  });

  it('refuses a project name that would leave the previews folder', async () => {
    await expect(service.start(TOKEN, '../etc')).rejects.toBeInstanceOf(BadRequestException);
    expect(run).not.toHaveBeenCalled();
  });

  it('explains a startup failure simply, without technical detail', async () => {
    run.mockRejectedValueOnce(new Error('fatal: could not read from remote repository'));
    await expect(service.start(TOKEN, 'poc-portail')).rejects.toThrow(/L’aperçu n’a pas pu démarrer/);
  });

  describe('restart of the application after a branch change', () => {
    const writeProject = (adaJson: string | null) => {
      const folder = join(root, 'poc');
      mkdirSync(join(folder, 'depot'), { recursive: true });
      writeFileSync(join(folder, 'compose.yml'), 'services: {}\n');
      if (adaJson) writeFileSync(join(folder, 'depot', 'ada.json'), adaJson);
    };

    it('restarts the application container when it has an API in the background', async () => {
      writeProject(null); // without ada.json: Vue + NestJS template, API in the background
      await service.restartApplication('poc');
      expect(run).toHaveBeenCalledWith('docker', ['compose', '-f', 'compose.yml', 'restart', 'app'], { cwd: join(root, 'poc') });
    });

    it('also restarts an application without a background: Vite\'s hot reload sometimes keeps old modules', async () => {
      writeProject(JSON.stringify({ type: 'maquette', requiredChecks: ['x'], checks: ['y'], preview: { principal: 'npx vite' } }));
      await service.restartApplication('poc');
      expect(run).toHaveBeenCalledWith('docker', ['compose', '-f', 'compose.yml', 'restart', 'app'], { cwd: join(root, 'poc') });
    });

    it('does not wake a sleeping preview to restart it', async () => {
      writeProject(null);
      writeFileSync(join(root, 'poc', 'en-veille'), '');
      await service.restartApplication('poc');
      expect(run).not.toHaveBeenCalled();
    });

    it('does nothing if the preview has never been started', async () => {
      await service.restartApplication('poc');
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe('putting unused previews to sleep', () => {
    const isPreviewStarted = (project: string) => {
      mkdirSync(join(root, project), { recursive: true });
      writeFileSync(join(root, project, 'compose.yml'), 'services: {}');
    };
    const stops = () => run.mock.calls.filter(([, a]) => a.includes('stop')).map(([, , o]) => o?.cwd);

    it('stops a preview unused since the delay, keeps the ones in use', async () => {
      isPreviewStarted('ancien');
      isPreviewStarted('recent');
      const now = Date.now() + SLEEP_DELAY_MS + 1000;
      service.recordUse('recent');
      (service as unknown as { uses: Map<string, number> }).uses.set('recent', now - 60_000);
      expect(await service.putToSleep(now)).toEqual(['ancien']);
      expect(stops()).toEqual([join(root, 'ancien')]);
      expect(service.isAsleep('ancien')).toBe(true);
      // Already asleep: nothing to redo.
      expect(await service.putToSleep(now + 1000)).toEqual([]);
    });

    it('never stops the preview of a project where an agent is working', async () => {
      isPreviewStarted('occupe');
      mkdirSync(join(root, 'occupe', 'agent'), { recursive: true });
      writeFileSync(join(root, 'occupe', 'agent', 'verrou.json'), JSON.stringify({ pid: process.pid, number: 3, phase: 'implementation' }));
      expect(await service.putToSleep(Date.now() + SLEEP_DELAY_MS * 2)).toEqual([]);
      expect(stops()).toEqual([]);
    });

    it('a sleeping preview is reported “stopped” (not broken), then restarts on demand', async () => {
      isPreviewStarted('poc-portail');
      await service.putToSleep(Date.now() + SLEEP_DELAY_MS * 2);
      expect((await service.state('poc-portail')).state).toBe('stopped');
      const preview = await service.start(TOKEN, 'poc-portail');
      expect(preview.state).toBe('ready');
      expect(service.isAsleep('poc-portail')).toBe(false);
    });
  });
});
