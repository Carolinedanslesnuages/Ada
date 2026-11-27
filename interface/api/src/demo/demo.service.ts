import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PreviewService } from '../preview/preview.service.js';
import {
  demoAddress,
  assignPort,
  stateFromPs,
  generateCompose,
  generateStartScript,
  generateWorkScript,
  DEMO_RANGE,
  sharedVolumes,
} from '../preview/preview.js';
import { CONFIG, type Config } from '../config.js';
import { isolateGit } from '../preview/isolated-git.js';

export interface Demo {
  state: 'stopped' | 'starting' | 'ready' | 'error';
  /** Public address to share (without sign-in), when the demo is ready. */
  url: string | null;
  /** Without a started preview, no link: the PO sees why. */
  isPreviewStarted: boolean;
}

/**
 * Demo link: a second instance of the project, on the last approved version
 * (main branch), never on the assistant's work in progress. Its data is separate from
 * the preview's. Started on demand, updated after each merge.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private readonly inPreparation = new Set<string>();

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly preview: PreviewService,
  ) {}

  private folder(project: string): string {
    return join(this.preview.projectFolder(project), 'demo');
  }

  private async port(project: string): Promise<number> {
    const file = join(resolve(this.config.PREVIEWS_DIR), 'ports-demo.json');
    const assigned = (await readFile(file, 'utf8').then(JSON.parse).catch(() => ({}))) as Record<string, number>;
    const port = assignPort(project, assigned, DEMO_RANGE);
    if (assigned[project] !== port) {
      await mkdir(resolve(this.config.PREVIEWS_DIR), { recursive: true });
      await writeFile(file, JSON.stringify({ ...assigned, [project]: port }, null, 2));
    }
    return port;
  }

  async state(project: string): Promise<Demo> {
    const isPreviewStarted = this.preview.isPreviewStarted(project);
    const folder = this.folder(project);
    if (this.inPreparation.has(project)) return { state: 'starting', url: null, isPreviewStarted };
    if (!existsSync(join(folder, 'compose.yml'))) return { state: 'stopped', url: null, isPreviewStarted };
    const port = await this.port(project);
    const { stdout } = await this.preview.run('docker', ['compose', '-f', 'compose.yml', 'ps', '-a', '--format', 'json'], { cwd: folder });
    const state = stateFromPs(stdout, await this.preview.responds(`http://localhost:${port}`));
    return { state, url: state === 'ready' ? demoAddress(this.config.DEMO_URL, project, port) : null, isPreviewStarted };
  }

  /** Copy of main, up to date: the demo only shows what was approved and merged. */
  private async prepareRepository(token: string, project: string): Promise<string> {
    const repository = join(this.folder(project), 'depot');
    const env = this.preview.gitEnvironment(token);
    const git = (...args: string[]) => this.preview.run('git', ['-C', repository, ...args], { env });
    if (!existsSync(join(repository, '.git'))) {
      await mkdir(this.folder(project), { recursive: true });
      const url = this.preview.repositoryUrl(project);
      const gitFolder = join(this.folder(project), 'git');
      await rm(gitFolder, { recursive: true, force: true }); // leftover of an interrupted clone
      await this.preview.run('git', ['clone', '--quiet', '--branch', 'main', '--separate-git-dir', gitFolder, url, repository], { env });
      return repository;
    }
    await isolateGit(repository);
    // Copy reserved for the demo, never modified by hand: it is aligned on main (data ignored by git is kept).
    await git('fetch', '--quiet', 'origin', 'main');
    await git('checkout', '--quiet', '-B', 'main', 'origin/main');
    await git('reset', '--quiet', '--hard', 'origin/main');
    return repository;
  }

  async start(token: string, project: string): Promise<Demo> {
    if (!this.preview.isPreviewStarted(project)) {
      throw new BadRequestException('Démarrez d’abord l’aperçu du projet : le lien de démonstration en dépend.');
    }
    if (this.inPreparation.has(project)) return this.state(project);
    this.inPreparation.add(project);
    const folder = this.folder(project);
    try {
      const repository = await this.prepareRepository(token, project);
      const config = await this.preview.readConfig(repository);
      const port = await this.port(project);
      const host = new URL(demoAddress(this.config.DEMO_URL, project, port)).hostname;
      await writeFile(join(folder, 'compose.yml'), generateCompose(project, port, config, { name: `demo-${project}`, allowedHosts: [host] }));
      await writeFile(join(folder, 'demarrer.sh'), generateStartScript(config), { mode: 0o755 });
      await writeFile(join(folder, 'travail.sh'), generateWorkScript(config), { mode: 0o755 });
      for (const volume of sharedVolumes(config)) await this.preview.run('docker', ['volume', 'create', volume]);
      await this.preview.run('docker', ['compose', '-f', 'compose.yml', 'up', '-d', '--remove-orphans'], { cwd: folder });
    } catch (e) {
      this.logger.warn(`Demo of ${project}: ${(e as Error).message.split('\n')[0]}`);
      throw new BadRequestException('Le lien de démonstration n’a pas pu être préparé. Réessayez ; si cela persiste, prévenez un développeur.');
    } finally {
      this.inPreparation.delete(project);
    }
    return this.state(project);
  }

  /** After a merge: the demo (if it exists) moves to the new approved version. */
  async update(token: string, project: string): Promise<void> {
    const folder = this.folder(project);
    if (!existsSync(join(folder, 'compose.yml'))) return;
    await this.prepareRepository(token, project);
    await this.preview.run('docker', ['compose', '-f', 'compose.yml', 'restart', 'app'], { cwd: folder });
  }
}
