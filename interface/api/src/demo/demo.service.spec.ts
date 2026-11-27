import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { readConfig } from '../config.js';
import { PreviewService, type Runner } from '../preview/preview.service.js';
import { DemoService } from './demo.service.js';

const TOKEN = 'jeton-secret-du-po';

describe('Demo link', () => {
  let root: string;
  let preview: PreviewService;
  let run: ReturnType<typeof vi.fn<Runner>>;
  let service: DemoService;

  const create = (demoUrl?: string) => {
    const config = readConfig({
      GITHUB_OWNER: 'proprio',
      GITHUB_CLIENT_ID: 'Iv',
      GITHUB_CLIENT_SECRET: 's',
      SESSION_SECRET: 'x'.repeat(32),
      PREVIEWS_DIR: root,
      ...(demoUrl ? { DEMO_URL: demoUrl } : {}),
    });
    preview = new PreviewService(config);
    preview.run = run;
    preview.responds = async () => true;
    service = new DemoService(config, preview);
  };

  const startPreview = () => {
    mkdirSync(join(root, 'poc'), { recursive: true });
    writeFileSync(join(root, 'poc', 'compose.yml'), 'services: {}\n');
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'demo-'));
    run = vi.fn<Runner>(async (command, args) => {
      if (command === 'git' && args[0] === 'clone') {
        const gitFolder = args[args.indexOf('--separate-git-dir') + 1]!;
        mkdirSync(args.at(-1)!, { recursive: true });
        mkdirSync(gitFolder, { recursive: true });
        writeFileSync(join(args.at(-1)!, '.git'), `gitdir: ${gitFolder}\n`);
      }
      if (args.includes('ps')) return { stdout: JSON.stringify({ Service: 'app', State: 'running' }) };
      return { stdout: '' };
    });
    create();
  });

  it('without a started preview: no link, and ADA says why', async () => {
    expect(await service.state('poc')).toEqual({ state: 'stopped', url: null, isPreviewStarted: false });
    await expect(service.start(TOKEN, 'poc')).rejects.toThrow(/Démarrez d’abord l’aperçu/);
    await expect(service.start(TOKEN, 'poc')).rejects.toBeInstanceOf(BadRequestException);
    expect(run).not.toHaveBeenCalled();
  });

  it('starts a separate instance on main (never the work in progress), with its own port', async () => {
    startPreview();
    const demo = await service.start(TOKEN, 'poc');
    expect(demo).toEqual({ state: 'ready', url: 'http://localhost:5400', isPreviewStarted: true });
    const clone = run.mock.calls.find(([command, args]) => command === 'git' && args[0] === 'clone')!;
    expect(clone[1]).toEqual(['clone', '--quiet', '--branch', 'main', '--separate-git-dir', join(root, 'poc', 'demo', 'git'), 'https://github.com/proprio/poc.git', join(root, 'poc', 'demo', 'depot')]);
    expect(clone[1].join(' ')).not.toContain(TOKEN);
    const compose = readFileSync(join(root, 'poc', 'demo', 'compose.yml'), 'utf8');
    expect(compose).toContain('name: demo-poc');
    expect(compose).toContain('"127.0.0.1:5400:');
    expect(run).toHaveBeenCalledWith('docker', ['compose', '-f', 'compose.yml', 'up', '-d', '--remove-orphans'], { cwd: join(root, 'poc', 'demo') });
  });

  it('gives the configured public address and allows this host in the development server', async () => {
    create('https://{projet}.demo.ada.gouv.fr');
    startPreview();
    expect((await service.start(TOKEN, 'poc')).url).toBe('https://poc.demo.ada.gouv.fr');
    expect(readFileSync(join(root, 'poc', 'demo', 'compose.yml'), 'utf8')).toContain('__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: poc.demo.ada.gouv.fr');
  });

  it('after a merge, aligns the demo on main and restarts it; nothing if it does not exist', async () => {
    await service.update(TOKEN, 'poc');
    expect(run).not.toHaveBeenCalled();
    startPreview();
    await service.start(TOKEN, 'poc');
    run.mockClear();
    await service.update(TOKEN, 'poc');
    const commands = run.mock.calls.map(([command, args]) => `${command} ${args.filter((arg) => !arg.startsWith('/')).join(' ')}`);
    expect(commands).toEqual([
      'git -C fetch --quiet origin main',
      'git -C checkout --quiet -B main origin/main',
      'git -C reset --quiet --hard origin/main',
      'docker compose -f compose.yml restart app',
    ]);
  });
});
