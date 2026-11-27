import { BadRequestException, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { CONFIG, type Config } from '../config.js';
import { readAdaConfig, type AdaConfig } from '../ada/ada-config.js';
import {
  assignPort,
  stateFromPs,
  generateCompose,
  generateStartScript,
  generateWorkScript,
  sharedVolumes,
  type PreviewState,
} from './preview.js';
import { parseIdentifier } from '../projects/repository.js';
import { liveLock } from '../agent/lock.js';
import { isolatedGitEnvironment, isolateGit } from './isolated-git.js';

export interface Preview {
  state: PreviewState;
  url: string | null;
  /** Last lines of the container log, useful when the state is “error”. */
  log: string | null;
}

export type Runner = (
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile);
/**
 * git run on the repository of a preview (`git -C <repository> …`): its git folder is designated
 * explicitly, outside the folder mounted in the container (see isolated-git.ts).
 */
export const defaultRun: Runner = (command, args, options) => {
  const repository = command === 'git' && args[0] === '-C' ? args[1] : undefined;
  const env = repository ? isolatedGitEnvironment(options?.env ?? process.env, repository) : options?.env;
  return execFileAsync(command, args, { ...options, ...(env ? { env } : {}), maxBuffer: 10 * 1024 * 1024 });
};

/** A preview unused since this delay is put to sleep: the Mac no longer runs every project. */
export const SLEEP_DELAY_MS = 30 * 60 * 1000;
const SLEEP_INTERVAL_MS = 5 * 60 * 1000;
/** File placed in the folder of a sleeping preview: it is stopped, not broken. */
const SLEEP_MARKER = 'en-veille';

@Injectable()
export class PreviewService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PreviewService.name);
  private readonly inPreparation = new Set<string>();
  /** Last use of each preview (screen displaying it, agent working in it). */
  private readonly uses = new Map<string, number>();
  /** When the API starts, each one is entitled to the full delay. */
  private readonly apiStartedAt = Date.now();
  private sleepTimer: ReturnType<typeof setInterval> | null = null;
  run: Runner = defaultRun;
  responds: (url: string) => Promise<boolean> = async (url) => {
    try {
      return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
    } catch {
      return false;
    }
  };

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  onModuleInit(): void {
    this.sleepTimer = setInterval(() => void this.putToSleep().catch((e: unknown) => this.logger.warn(`Putting to sleep: ${(e as Error).message}`)), SLEEP_INTERVAL_MS);
    this.sleepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sleepTimer) clearInterval(this.sleepTimer);
  }

  /** Preview put to sleep for lack of use: to wake before an agent works in it. */
  isAsleep(project: string): boolean {
    return existsSync(join(this.projectFolder(project), SLEEP_MARKER));
  }

  /** The preview is in use (displayed, or an agent works in it): it stays on. */
  recordUse(project: string): void {
    this.uses.set(project, Date.now());
  }

  /** An agent works in this project (its lock exists, its process is alive and still beats): it is left alone. */
  private hasActiveAgent(project: string): boolean {
    return liveLock(join(this.root, project, 'agent', 'verrou.json')) !== null;
  }

  /** Projects where an agent is working right now: used to cap the number of agents on the machine. */
  async projectsWithAgent(): Promise<string[]> {
    const folders = await readdir(this.root).catch(() => [] as string[]);
    return folders.filter((project) => this.hasActiveAgent(project));
  }

  /**
   * Puts to sleep the previews unused since SLEEP_DELAY_MS: containers stopped (data and
   * installation kept), restarted the next time the project is opened. Returns the stopped projects.
   */
  async putToSleep(now = Date.now()): Promise<string[]> {
    const stopped: string[] = [];
    const projects = await readdir(this.root).catch(() => [] as string[]);
    for (const project of projects) {
      const folder = join(this.root, project);
      if (!existsSync(join(folder, 'compose.yml')) || existsSync(join(folder, SLEEP_MARKER))) continue;
      const lastUsedAt = this.uses.get(project) ?? this.apiStartedAt;
      if (now - lastUsedAt < SLEEP_DELAY_MS || this.inPreparation.has(project) || this.hasActiveAgent(project)) continue;
      await this.run('docker', ['compose', '-f', 'compose.yml', 'stop'], { cwd: folder });
      await writeFile(join(folder, SLEEP_MARKER), new Date(now).toISOString());
      this.logger.log(`Preview of ${project} put to sleep (unused for ${Math.round((now - lastUsedAt) / 60000)} min)`);
      stopped.push(project);
    }
    return stopped;
  }

  private get root(): string {
    return resolve(this.config.PREVIEWS_DIR);
  }

  private verify(project: string): void {
    parseIdentifier(project, this.config.GITHUB_OWNER);
  }

  /** Git address of a project's repository (ADA's organization or the PO's account). */
  repositoryUrl(project: string): string {
    const { owner, repo } = parseIdentifier(project, this.config.GITHUB_OWNER);
    return `https://github.com/${owner}/${repo}.git`;
  }

  private async ports(): Promise<Record<string, number>> {
    try {
      return JSON.parse(await readFile(join(this.root, 'ports.json'), 'utf8')) as Record<string, number>;
    } catch {
      return {};
    }
  }

  private async port(project: string): Promise<number> {
    const assigned = await this.ports();
    const port = assignPort(project, assigned);
    if (assigned[project] !== port) {
      await mkdir(this.root, { recursive: true });
      await writeFile(join(this.root, 'ports.json'), JSON.stringify({ ...assigned, [project]: port }, null, 2));
    }
    return port;
  }

  async state(project: string): Promise<Preview> {
    this.verify(project);
    this.recordUse(project);
    const folder = join(this.root, project);
    if (!this.inPreparation.has(project) && existsSync(join(folder, SLEEP_MARKER))) return { state: 'stopped', url: null, log: null };
    if (!existsSync(join(folder, 'compose.yml'))) {
      return { state: this.inPreparation.has(project) ? 'starting' : 'stopped', url: null, log: null };
    }
    const url = `http://localhost:${await this.port(project)}`;
    const { stdout } = await this.run('docker', ['compose', '-f', 'compose.yml', 'ps', '-a', '--format', 'json'], {
      cwd: folder,
    });
    const state = this.inPreparation.has(project) ? 'starting' : stateFromPs(stdout, await this.responds(url));
    return { state, url: state === 'ready' ? url : null, log: state === 'ready' ? null : await this.lastLines(folder) };
  }

  /** ada.json of the project; missing (projects from before ada.json) → Vue + NestJS behaviour. */
  async readConfig(repository: string): Promise<AdaConfig> {
    return readAdaConfig(await readFile(join(repository, 'ada.json'), 'utf8').catch(() => null));
  }

  /** Working folder of a project (preview, demo, assistant). */
  projectFolder(project: string): string {
    this.verify(project);
    return join(this.root, project);
  }

  /** The working preview has been started (its containers exist). */
  isPreviewStarted(project: string): boolean {
    return existsSync(join(this.projectFolder(project), 'compose.yml'));
  }

  repositoryPath(project: string): string {
    this.verify(project);
    return join(this.root, project, 'depot');
  }

  /** Authenticated git environment: the token goes through the environment, never as an argument or in .git/config. */
  gitEnvironment(token: string): NodeJS.ProcessEnv {
    const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
    return {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`,
    };
  }

  /**
   * Clones the repository, or updates it without touching the work in progress: GitHub is fetched, and
   * the local copy only moves forward if it is on main (a story branch stays as is).
   */
  async prepareRepository(token: string, project: string): Promise<string> {
    const repository = this.repositoryPath(project);
    await mkdir(join(this.root, project), { recursive: true });
    const env = this.gitEnvironment(token);
    if (existsSync(join(repository, '.git'))) {
      await isolateGit(repository);
      await this.run('git', ['-C', repository, 'fetch', '--quiet', 'origin'], { env });
      const { stdout } = await this.run('git', ['-C', repository, 'rev-parse', '--abbrev-ref', 'HEAD']);
      if (stdout.trim() === 'main') {
        await this.run('git', ['-C', repository, 'merge', '--ff-only', '--quiet', 'origin/main'], { env });
      }
    } else {
      const url = this.repositoryUrl(project);
      // Git folder stored next to the repository, outside the folder mounted in the container (see isolated-git.ts).
      const gitFolder = join(this.root, project, 'git');
      await rm(gitFolder, { recursive: true, force: true }); // leftover of an interrupted clone
      await this.run('git', ['clone', '--quiet', '--separate-git-dir', gitFolder, url, repository], { env });
    }
    return repository;
  }

  /**
   * After a merge: the preview copy goes back to main, up to date. The npm changes to the
   * package-lock.json files are reverted; hot reload shows the merged project.
   */
  async returnToMain(token: string, project: string): Promise<void> {
    const repository = this.repositoryPath(project);
    const env = this.gitEnvironment(token);
    const git = (...args: string[]) => this.run('git', ['-C', repository, ...args], { env });
    await git('fetch', '--quiet', 'origin');
    const { stdout } = await git('status', '--porcelain');
    const locks = stdout
      .split('\n')
      .map((l) => l.slice(3).trim())
      .filter((f) => f.endsWith('package-lock.json'));
    if (locks.length) await git('checkout', '--', ...locks);
    await git('checkout', '--quiet', 'main');
    await git('merge', '--ff-only', '--quiet', 'origin/main');
  }

  /**
   * Restarts the preview application (API in the background) after a branch change made by
   * git: automatic reload (node --watch, nest --watch) does not always see the
   * replaced files, and the preview would then serve the old API. The front alone neither: Vite's
   * hot reload can keep old modules. Nothing to do if it is asleep.
   */
  async restartApplication(project: string): Promise<void> {
    this.verify(project);
    const folder = join(this.root, project);
    if (!existsSync(join(folder, 'compose.yml')) || existsSync(join(folder, SLEEP_MARKER))) return;
    // Always, even without an API in the background: after a branch change (dozens of
    // files at once), Vite's hot reload sometimes keeps old modules and
    // the application no longer opens (Gladys: “ErreurReseau” not found).
    await this.run('docker', ['compose', '-f', 'compose.yml', 'restart', 'app'], { cwd: folder });
  }

  /** Prepares the repository with the PO's rights, then starts the containers. */
  async start(token: string, project: string): Promise<Preview> {
    this.verify(project);
    if (this.inPreparation.has(project)) return this.state(project);
    this.inPreparation.add(project);
    this.recordUse(project);
    const folder = join(this.root, project);
    try {
      const repository = await this.prepareRepository(token, project);
      const config = await this.readConfig(repository);
      await writeFile(join(folder, 'compose.yml'), generateCompose(project, await this.port(project), config));
      await writeFile(join(folder, 'demarrer.sh'), generateStartScript(config), { mode: 0o755 });
      await writeFile(join(folder, 'travail.sh'), generateWorkScript(config), { mode: 0o755 });
      for (const volume of sharedVolumes(config)) await this.run('docker', ['volume', 'create', volume]);
      await this.run('docker', ['compose', '-f', 'compose.yml', 'up', '-d', '--remove-orphans'], { cwd: folder });
      await rm(join(folder, SLEEP_MARKER), { force: true });
    } catch (e) {
      this.logger.warn(`Preview of ${project}: ${(e as Error).message.split('\n')[0]}`);
      throw new BadRequestException('L’aperçu n’a pas pu démarrer. Réessayez ; si cela persiste, prévenez un développeur.');
    } finally {
      this.inPreparation.delete(project);
    }
    return this.state(project);
  }

  private async lastLines(folder: string): Promise<string | null> {
    try {
      const { stdout } = await this.run('docker', ['compose', '-f', 'compose.yml', 'logs', 'app', '--tail', '15', '--no-color'], {
        cwd: folder,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
