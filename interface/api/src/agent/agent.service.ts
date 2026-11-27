/**
 * What the PO asks of the agent: launch, relaunch, approve a plan, converse, stop. Each
 * action checks that it can start BEFORE writing to GitHub, then hands the task to
 * the scheduler; the work of each phase is described in phase-*.ts.
 */
import { BadRequestException, ConflictException, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { dirname, join, resolve } from 'node:path';
import { PreviewService } from '../preview/preview.service.js';
import { CONFIG, type Config } from '../config.js';
import { EQUIVALENTS } from '../footprint/footprint.js';
import { readFootprints, sumUp } from '../footprint/footprint-log.js';
import { GithubService } from '../github/github.service.js';
import { parseIdentifier } from '../projects/repository.js';
import { ProjectsService } from '../projects/projects.service.js';
import { StoriesService, type StoryDetail } from '../stories/stories.service.js';
import { checkMessage } from '../stories/story.js';
import type { Task } from './agent.js';
import type { StackAdvice } from './stack-advice.js';
import { StackAdviser } from './stack-adviser.js';
import { WaitingQueue } from './waiting-queue.js';
import { ActivityLog, type Activity } from './activity-log.js';
import { UserModelStore } from '../user-model/user-model.js';
import { defaultLaunch, type AgentLauncher } from './launch.js';
import { Scheduler } from './scheduler.js';
import { PhaseTools } from './phase-tools.js';
import { analysisPhase } from './phase-analysis.js';
import { conversationPhase } from './phase-conversation.js';
import { implementationPhase } from './phase-implementation.js';
import { adoptionPhase } from './phase-adoption.js';
import { ProjectLock } from './project-lock.js';
import type { Lock } from './lock.js';

@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AgentService.name);
  launchAgent: AgentLauncher;
  private readonly activityLog: ActivityLog;
  private readonly lock: ProjectLock;
  private readonly file: WaitingQueue;
  private readonly scheduler: Scheduler;
  private readonly tools: PhaseTools;
  private readonly adviser: StackAdviser;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly stories: StoriesService,
    private readonly preview: PreviewService,
    projects: ProjectsService,
  ) {
    this.launchAgent = defaultLaunch(config.AGENT_COMMAND);
    // Working folder of the agent for a project: next to its preview.
    const agentFolder = (repository: string) => join(dirname(this.preview.repositoryPath(repository)), 'agent');
    this.activityLog = new ActivityLog(agentFolder);
    this.lock = new ProjectLock(agentFolder);
    this.file = new WaitingQueue(() => join(resolve(this.config.PREVIEWS_DIR), '.file-attente'));
    this.tools = new PhaseTools(config, github, stories, preview, this.activityLog, () => this.launchAgent, this.log, new UserModelStore(config.USER_MODELS_DIR, config.SESSION_SECRET));
    this.adviser = new StackAdviser(config, projects, () => this.launchAgent, this.log);
    const work = (task: Task): Promise<void> => {
      if (task.phase === 'analysis') return analysisPhase(this.tools, task);
      if (task.phase === 'adoption') return adoptionPhase(this.tools, projects, task);
      if (task.phase === 'conversation') return conversationPhase(this.tools, task);
      return implementationPhase(this.tools, task);
    };
    this.scheduler = new Scheduler({ config, preview, lock: this.lock, activityLog: this.activityLog, file: this.file, work, agentFolder, log: this.log });
  }

  /** True: each task runs in a detached worker process (see Scheduler). */
  get usesSeparateWorker(): boolean {
    return this.scheduler.usesSeparateWorker;
  }

  set usesSeparateWorker(value: boolean) {
    this.scheduler.usesSeparateWorker = value;
  }

  /** Last background task launched (lets the tests wait for its end). */
  get lastTask(): Promise<void> {
    return this.scheduler.lastTask;
  }

  onModuleInit(): void {
    this.scheduler.startTimer();
  }

  onModuleDestroy(): void {
    this.scheduler.stopTimer();
  }

  /** Lock of the project, if it is held by a live process that still beats. */
  activeLock(repository: string): Promise<Lock | null> {
    return this.lock.active(repository);
  }

  /** A task of this project (and of this request, if given) is waiting for its turn. */
  queued(repository: string, number?: number): Promise<boolean> {
    return this.file.contains(repository, number);
  }

  processQueue(now = Date.now()): Promise<void> {
    return this.scheduler.processQueue(now);
  }

  /** Runs the task in this process (worker, or tests) and keeps the activity up to date. */
  runTask(task: Task): Promise<void> {
    return this.scheduler.run(task);
  }

  checkFree(repository: string): Promise<void> {
    return this.scheduler.checkFree(repository);
  }

  /**
   * Everything that must be true to launch or relaunch ADA on this project, checked before any
   * write to GitHub: agent configured, project under its current name, project free.
   */
  async checkLaunchable(token: string, repository: string): Promise<void> {
    this.checkAvailable();
    await this.checkCurrentName(token, repository);
    await this.checkFree(repository);
  }

  checkAvailable(): void {
    if (!this.config.AGENT_COMMAND) {
      throw new BadRequestException('Aucun agent n’est configuré pour cet atelier (AGENT_COMMAND). Prévenez son administrateur.');
    }
  }

  /**
   * A repository renamed on GitHub stays reachable under its former name (redirect): ADA, which stores
   * lock, log and preview under the name, would see two projects and could launch two agents
   * on the same story. Any launch under an outdated name is therefore refused.
   */
  private async checkCurrentName(token: string, repository: string): Promise<void> {
    const target = parseIdentifier(repository, this.config.GITHUB_OWNER);
    const { data } = await this.github.client(token).repos.get({ owner: target.owner, repo: target.repo });
    if (data.name.toLowerCase() !== target.repo.toLowerCase()) {
      throw new ConflictException(
        `Ce projet a été renommé « ${data.name} » sur GitHub. Rouvrez-le sous ce nom dans la liste des projets, puis relancez.`,
      );
    }
  }

  /** Estimated footprint of a request (every run of the agent for it). */
  async workRequestFootprint(repository: string, number: number) {
    const entries = (await readFootprints(this.config.REGISTRY_DIR)).filter((entry) => entry.project === repository && entry.number === number);
    return entries.length ? { footprint: sumUp(entries), equivalents: EQUIVALENTS } : null;
  }

  /** Estimated footprint of a project: every run of the agent, all requests combined. */
  async projectFootprint(repository: string) {
    const entries = (await readFootprints(this.config.REGISTRY_DIR)).filter((entry) => entry.project === repository);
    if (!entries.length) return null;
    return { footprint: sumUp(entries), workRequests: new Set(entries.map((entry) => entry.number)).size, equivalents: EQUIVALENTS };
  }

  /** “In progress” only if an agent is really running (not a leftover of an interrupted run). */
  async activity(repository: string, number: number): Promise<Activity> {
    const activity = await this.activityLog.read(repository, number);
    const lock = await this.lock.active(repository);
    const inProgress = activity.inProgress && (lock?.number === number || (await this.file.contains(repository, number)));
    return { ...activity, inProgress };
  }

  /** Remembers the commit ADA just pushed (null: compare nothing any more). */
  async recordHead(repository: string, number: number, sha: string | null): Promise<void> {
    await this.activityLog.save(repository, number, { head: sha });
  }

  adviseStack(idea: unknown): Promise<StackAdvice> {
    return this.adviser.adviser(idea);
  }

  /**
   * Starts a task for the request: only one per project and at most AGENT_MAX_CONCURRENT on
   * the whole machine; beyond that, it waits for its turn (see Scheduler).
   */
  private async launchTask(task: Task): Promise<void> {
    this.checkAvailable();
    await this.checkCurrentName(task.token, task.repository);
    await this.scheduler.launch(task);
  }

  /**
   * The detail of a request about to be handed to the agent. A request launched before its
   * state lived in ADA (ADR-0011) is frozen from the live issue on the agent's first pass:
   * if its author has no write access to the project, it is not handed over.
   */
  private async trustedDetail(token: string, repository: string, number: number): Promise<StoryDetail> {
    const detail = await this.stories.detail(token, repository, number);
    if (detail.reliable === false) throw new ConflictException(`ADA ne reprend pas la demande #${number} : ${detail.reason ?? 'son auteur n’a pas le droit d’écrire dans le projet'}`);
    return detail;
  }

  /**
   * Request in progress or blocked without an active agent. Plan already approved (last phase:
   * implementation) → the implementation resumes; otherwise → new analysis.
   */
  async relaunch(token: string, login: string, repository: string, number: number): Promise<void> {
    await this.checkLaunchable(token, repository);
    const detail = await this.trustedDetail(token, repository, number);
    if (detail.status !== 'in-progress' && detail.status !== 'needs-developer') {
      throw new ConflictException('Cette demande n’a pas besoin d’être relancée');
    }
    await this.stories.changeStatus(token, repository, number, 'in-progress');
    const previous = await this.activityLog.read(repository, number);
    if (previous.phase === 'conversation') {
      await this.activityLog.record(repository, number, 'Reprend la conversation');
      await this.converse(token, login, repository, number);
    } else if (previous.phase === 'implementation') {
      await this.activityLog.record(repository, number, 'Reprend la réalisation');
      await this.implement(token, login, repository, number);
    } else {
      await this.analyze(token, repository, number, login);
    }
  }

  /** Analysis: questions or plan, published in the issue; no change to the code. */
  analyze(token: string, repository: string, number: number, login = ''): Promise<void> {
    return this.launchTask({ phase: 'analysis', token, login, repository, number });
  }

  /** Adoption of an existing project (#37): analysis, then adoption PR and proposed improvements. */
  analyzeAdoption(token: string, repository: string, number: number, login: string, adoption: { template: string | null; dsfr: boolean }): Promise<void> {
    return this.launchTask({ phase: 'adoption', token, login, repository, number, adoption });
  }

  /** The PO asks to revise the plan, or answers the questions: new analysis. */
  async resumeAnalysis(token: string, repository: string, number: number, text: string): Promise<void> {
    await this.checkLaunchable(token, repository);
    const detail = await this.trustedDetail(token, repository, number);
    // Another breakdown can also be requested (#36).
    if (detail.status !== 'questions' && detail.status !== 'plan-to-approve' && detail.status !== 'breakdown') {
      throw new ConflictException('ADA n’attend pas de réponse sur cette demande');
    }
    await this.stories.reply(token, repository, number, text);
    await this.stories.changeStatus(token, repository, number, 'in-progress');
    await this.analyze(token, repository, number);
  }

  /** The PO approves the plan: implementation on a branch, then branch pushed and PR opened. */
  async approvePlan(token: string, login: string, repository: string, number: number): Promise<void> {
    await this.checkLaunchable(token, repository);
    const detail = await this.trustedDetail(token, repository, number);
    if (detail.status !== 'plan-to-approve') throw new ConflictException('Aucun plan n’attend votre validation');
    await this.stories.reply(token, repository, number, `✅ Plan validé par ${login}.`);
    await this.stories.changeStatus(token, repository, number, 'in-progress');
    await this.implement(token, login, repository, number);
  }

  private implement(token: string, login: string, repository: string, number: number): Promise<void> {
    return this.launchTask({ phase: 'implementation', token, login, repository, number });
  }

  /** Conversation: ADA answers the PO's last message, acting right away on its branch. */
  converse(token: string, login: string, repository: string, number: number): Promise<void> {
    return this.launchTask({ phase: 'conversation', token, login, repository, number });
  }

  /** The PO writes in the conversation: ADA takes over again. */
  async resumeConversation(token: string, login: string, repository: string, number: number, text: unknown): Promise<void> {
    await this.checkLaunchable(token, repository);
    const verification = checkMessage(text, false);
    if (!verification.ok) throw new BadRequestException(verification.error);
    const detail = await this.stories.detail(token, repository, number);
    if (detail.type !== 'conversation' || detail.status !== 'exchange') throw new ConflictException('ADA n’attend pas de message dans cette conversation');
    await this.stories.reply(token, repository, number, verification.text);
    await this.stories.changeStatus(token, repository, number, 'in-progress');
    await this.converse(token, login, repository, number);
  }

  /**
   * “All good”: ADA runs the full checks (only once), then proposes the changes
   * to the project (PR), or closes the conversation if there are none. Agent task, in the background.
   */
  async finishConversation(token: string, login: string, repository: string, number: number): Promise<void> {
    await this.checkLaunchable(token, repository);
    const detail = await this.stories.detail(token, repository, number);
    if (detail.type !== 'conversation' || detail.status !== 'exchange') throw new ConflictException('Cette conversation ne peut pas être terminée maintenant');
    await this.stories.reply(token, repository, number, `✅ C’est bon : ${login} demande de proposer ces changements au projet.`);
    await this.stories.changeStatus(token, repository, number, 'in-progress');
    await this.launchTask({ phase: 'conversation', token, login, repository, number, finalize: true });
  }

  /** The PO stops the conversation: nothing reaches the project (the branch stays on GitHub). */
  async stopConversation(token: string, login: string, repository: string, number: number): Promise<void> {
    if ((await this.activeLock(repository)) || (await this.queued(repository))) throw new ConflictException('ADA travaille encore : attendez sa réponse');
    const detail = await this.stories.detail(token, repository, number);
    if (detail.type !== 'conversation' || detail.status === 'delivered') throw new ConflictException('Cette conversation est déjà terminée');
    await this.stories.closeAsNotPlanned(token, repository, number, `💬 Conversation arrêtée par ${login} : rien n’est ajouté au projet.`);
  }
}
