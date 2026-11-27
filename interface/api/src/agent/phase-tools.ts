/**
 * What every phase of the agent shares: reading the frozen request, running the agent, keeping the
 * activity feed, preparing and sending the branch, opening the PR, reporting a blocker to the PO.
 */
import type { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PreviewService } from '../preview/preview.service.js';
import type { Config } from '../config.js';
import { readUsages, type ModelUsage } from '../footprint/footprint.js';
import { recordFootprint } from '../footprint/footprint-log.js';
import type { GithubService } from '../github/github.service.js';
import { parseIdentifier } from '../projects/repository.js';
import { CONVERSATION_PREFIX, FREE_PREFIX } from '../stories/story.js';
import { LAUNCH_START, ASSISTANT_MARKER, type StoriesService } from '../stories/stories.service.js';
import type { WorkRequest, Phase, ExistingStory } from './agent.js';
import { describeEvent } from './activity.js';
import { equipSkills } from './equip-skills.js';
import { modifiedFiles } from './modified-files.js';
import type { Activity, ActivityLog } from './activity-log.js';
import { defaultLaunch, modelOption, type AgentLauncher } from './launch.js';
import { modelEnvironment, UserModelStore } from '../user-model/user-model.js';
import { reservedPaths, ISOLATION_OPTIONS, FORBIDDEN_TOOLS, allowedTools } from './tools.js';
import { pathsToRecord } from './pending-commit.js';

/** Maximum agent turns per phase. */
const TURNS: Record<Phase, number> = { analysis: 30, implementation: 150, adoption: 40, conversation: 100 };

export class PhaseTools {
  private rgaaIndex: string | null | undefined;

  constructor(
    readonly config: Config,
    readonly github: GithubService,
    readonly stories: StoriesService,
    readonly preview: PreviewService,
    private readonly activityLog: ActivityLog,
    /** The agent to launch, read at each run (the tests replace it). */
    private readonly launchAgent: () => AgentLauncher,
    readonly log: Logger,
    /** Personal models of the users (“My model” page). */
    private readonly userModels: UserModelStore | null = null,
  ) {}

  record(repository: string, number: number, text: string): Promise<void> {
    return this.activityLog.record(repository, number, text);
  }

  save(repository: string, number: number, update: Partial<Activity>): Promise<Activity> {
    return this.activityLog.save(repository, number, update);
  }

  readActivity(repository: string, number: number): Promise<Activity> {
    return this.activityLog.read(repository, number);
  }

  /** RGAA index read once; missing → the assistant keeps the basics (ACCESSIBILITY). */
  async readRgaaIndex(): Promise<string | null> {
    if (this.rgaaIndex !== undefined) return this.rgaaIndex;
    try {
      this.rgaaIndex = await readFile(resolve(this.config.RGAA_INDEX), 'utf8');
    } catch {
      this.log.warn(`RGAA index not found (${this.config.RGAA_INDEX}): the assistant will only have the basics`);
      this.rgaaIndex = null;
    }
    return this.rgaaIndex;
  }

  equipSkills(cwd: string): Promise<{ names: string[]; folders: string[] }> {
    return equipSkills(cwd, this.config.AGENT_SKILLS, (message) => this.log.warn(message));
  }

  /** The other stories of the project, most recent first: ADA uses them to avoid duplicates. */
  async existingStories(token: string, repository: string, number: number): Promise<ExistingStory[]> {
    const stories = await this.stories.list(token, repository);
    return stories
      // The titles of these requests enter the agent's instructions: not those of an author without write access.
      .filter((story) => story.number !== number && story.reliable !== false)
      .map((story) => ({
        number: story.number,
        title: story.title,
        delivered: story.closedAt !== null,
        parent: story.parent,
        brokenDown: story.status === 'parent',
      }));
  }

  /**
   * The request as ADA froze it at launch, and the exchanges made through its interface
   * (ADA's log). The agent never reads the live issue or its comments: a title, a
   * label or a comment written by hand on GitHub cannot give it instructions.
   */
  async workRequest(token: string, repository: string, number: number): Promise<WorkRequest> {
    const { frozen, messages } = await this.stories.frozenWorkRequest(token, repository, number);
    const offset = messages.findIndex((m) => m.text.startsWith(LAUNCH_START));
    const exchanges = messages
      .slice(offset + 1)
      .map((m) =>
        m.text.startsWith(ASSISTANT_MARKER)
          ? { author: 'assistant' as const, text: m.text.replace(ASSISTANT_MARKER, '').trim() }
          : { author: 'po' as const, text: m.text.trim() },
      );
    return {
      number,
      title: frozen.title,
      type: frozen.type,
      content: frozen.content,
      bugContent: frozen.bugContent,
      freeContent: frozen.freeContent,
      parent: frozen.parent,
      exchanges,
    };
  }

  /** Runs a phase of the agent and returns its final answer (text). */
  async run(
    repository: string,
    number: number,
    phase: Phase,
    instructions: string,
    cwd: string,
    readableFolders: string[] = [],
    /** Conversation: named session (first message) or resumed (following messages). */
    session: { id: string; resume: boolean } | null = null,
    /** User who launched the request: if they filled in their own model (“My model”), it is the one that works. */
    login = '',
  ): Promise<string> {
    let result = '';
    let usages: ModelUsage[] = [];
    const personal = login && this.userModels ? await this.userModels.read(login) : null;
    // The personal model goes through the agent shipped with ADA (OpenAI-compatible gateway), with its key in the environment.
    const launch = personal ? defaultLaunch(this.config.AGENT_COMMAND_OPENAI, modelEnvironment(personal)) : this.launchAgent();
    await this.record(repository, number, `Travaille avec ${personal ? `votre modèle « ${personal.model} »` : this.config.AGENT_MODEL ? `le modèle « ${this.config.AGENT_MODEL} »` : 'le modèle par défaut d’ADA'}`);
    const args = [
      '-p',
      instructions,
      '--output-format',
      'stream-json',
      '--verbose',
      ...(personal ? ['--model', personal.model] : modelOption(this.config.AGENT_MODEL)),
      '--max-turns',
      String(TURNS[phase]),
      ...ISOLATION_OPTIONS,
      ...(session ? (session.resume ? ['--resume', session.id] : ['--session-id', session.id]) : ['--no-session-persistence']),
      '--disallowedTools',
      ...FORBIDDEN_TOOLS,
      '--allowedTools',
      ...allowedTools(phase, readableFolders),
    ];
    const notes: Promise<void>[] = [];
    const code = await launch(args, cwd, (line) => {
      for (const text of describeEvent(line)) notes.push(this.record(repository, number, text));
      try {
        const evt = JSON.parse(line) as { type?: string; result?: string; modelUsage?: unknown };
        if (evt.type === 'result' && typeof evt.result === 'string') result = evt.result;
        if (evt.type === 'result') usages = readUsages(evt.modelUsage);
      } catch {
        /* non-JSON line: ignored */
      }
    });
    await Promise.all(notes);
    // Carbon footprint: tokens per model only, never content; a write error
    // must not make the PO's work fail.
    await recordFootprint(this.config.REGISTRY_DIR, { at: new Date().toISOString(), project: repository, number, phase, session: session?.id ?? null, usages }).catch((e: unknown) =>
      this.log.warn(`Footprint of ${repository}#${number} not recorded: ${(e as Error).message}`),
    );
    if (code !== 0 && !result) throw new Error(`L’agent s’est arrêté (code ${code})`);
    return result;
  }

  /**
   * Puts the preview repository on the branch of the request. Already on this branch with
   * unsaved modifications: it is the work of an interrupted run of the same
   * request, kept so that the assistant resumes it. On another branch, it is refused:
   * two requests would be mixed up.
   */
  async prepareBranch(token: string, login: string, repository: string, branch: string): Promise<{ cwd: string; isWorkResumed: boolean }> {
    const cwd = await this.preview.prepareRepository(token, repository);
    const git = (...args: string[]) => this.preview.run('git', ['-C', cwd, ...args]);
    await git('config', 'user.name', login);
    await git('config', 'user.email', `${login}@users.noreply.github.com`);
    const { stdout: state } = await git('status', '--porcelain');
    const modified = state
      .split('\n')
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    // npm install (when the preview starts) sometimes touches the package-lock.json files: they are restored.
    const locks = modified.filter((file) => file.endsWith('package-lock.json'));
    if (locks.length) await git('checkout', '--', ...locks);
    const others = modified.length - locks.length;
    const { stdout: current } = await git('rev-parse', '--abbrev-ref', 'HEAD');
    if (others > 0) {
      if (current.trim() === branch) return { cwd, isWorkResumed: true };
      throw new Error('Le dépôt de l’aperçu contient des modifications non enregistrées');
    }
    const { stdout: existingStories } = await git('branch', '--list', branch);
    if (existingStories.trim()) await git('checkout', '--quiet', branch);
    else await git('checkout', '--quiet', '-b', branch, 'origin/main');
    return { cwd, isWorkResumed: false };
  }

  /** Records the modifications the agent left uncommitted (false: nothing to record). */
  async commitPending(cwd: string, message: string): Promise<boolean> {
    const git = (...args: string[]) => this.preview.run('git', ['-C', cwd, ...args]);
    const { stdout } = await git('status', '--porcelain');
    const modified = stdout
      .split('\n')
      .map((line) => line.slice(3).trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    const paths = pathsToRecord(modified);
    if (!paths.length) return false;
    await git('add', '--', ...paths);
    await git('commit', '--quiet', '-m', message);
    return true;
  }

  /** Number of commits of the branch beyond a reference (`origin/main..branch`, for example). */
  async countCommits(cwd: string, ...range: string[]): Promise<number> {
    const { stdout } = await this.preview.run('git', ['-C', cwd, 'rev-list', '--count', ...range]);
    return Number(stdout.trim());
  }

  /** Sends the branch (never main) and remembers the pushed commit: the merge will refuse a branch that moved forward outside ADA. */
  async push(token: string, repository: string, number: number, cwd: string, branch: string): Promise<void> {
    await this.record(repository, number, 'Envoie la branche sur GitHub');
    await this.preview.run('git', ['-C', cwd, 'push', '--quiet', '-u', 'origin', branch], { env: this.preview.gitEnvironment(token) });
    const { stdout } = await this.preview.run('git', ['-C', cwd, 'rev-parse', 'HEAD']);
    await this.save(repository, number, { head: stdout.trim() || null });
  }

  /** The preview must show this work, API included, so that the PO checks the real result. */
  async restartPreview(repository: string, number: number): Promise<void> {
    await this.record(repository, number, 'Relance l’aperçu');
    await this.preview.restartApplication(repository).catch((e: unknown) => this.log.warn(`Restart of the preview of ${repository}: ${(e as Error).message.split('\n')[0]}`));
  }

  async openPullRequest(token: string, repository: string, cwd: string, branch: string, workRequest: WorkRequest, summary: string): Promise<string> {
    let sheet = '';
    try {
      sheet = await readFile(join(cwd, 'revues', `${branch.replace('/', '-')}.md`), 'utf8');
    } catch {
      /* no sheet: the summary is enough */
    }
    const { data } = await this.github.client(token).pulls.create({
      ...parseIdentifier(repository, this.config.GITHUB_OWNER),
      head: branch,
      base: 'main',
      // Free mode: without the “Demande libre : ” prefix, for readable release notes.
      title: `${workRequest.type === 'bug' ? 'fix' : 'feat'}: ${workRequest.title.replace(FREE_PREFIX, '').replace(CONVERSATION_PREFIX, '')}`,
      body: `${summary}\n\nCloses #${workRequest.number}\n\n${sheet}`.trim(),
    });
    return data.html_url;
  }

  /**
   * Safeguard before any push: no file of .github/, helm/ or charts/ may change, whatever
   * the tool used (the agent's restrictions only cover direct editing).
   */
  async touchesReservedFolders(token: string, repository: string, number: number, cwd: string, branch: string): Promise<boolean> {
    const reserved = reservedPaths(await modifiedFiles(this.preview.run, cwd, branch));
    if (!reserved.length) return false;
    await this.block(
      token,
      repository,
      number,
      `J'ai modifié des fichiers réservés aux développeurs (${reserved.join(', ')}). Je n'envoie rien : un développeur doit vérifier.`,
    );
    return true;
  }

  async block(token: string, repository: string, number: number, reason: string): Promise<void> {
    // The reason first, locally: if GitHub refuses the write (expired token, outage), the PO's
    // screen still shows it, with “Relaunch ADA”, instead of a silent “in progress”.
    await this.save(repository, number, { error: reason });
    try {
      await this.stories.commentAsAssistant(token, repository, number, 'Besoin d’aide', `${reason}\n\nUn développeur doit regarder cette demande.`);
      await this.stories.changeStatus(token, repository, number, 'needs-developer');
    } catch (e) {
      this.log.warn(`Blocker of ${repository}#${number} not written to GitHub: ${(e as Error).message}`);
    }
    await this.record(repository, number, 'Bloqué : un développeur doit intervenir');
  }
}
