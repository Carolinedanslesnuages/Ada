import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { translateGithubError } from '../github/errors.js';
import {
  formatPrompt,
  BUG_LABEL,
  FREE_LABEL,
  STORY_LABEL,
  readBug,
  readPrompt,
  readConversation,
  formatConversation,
  conversationTitle,
  checkMessage,
  CONVERSATION_LABEL,
  readStory,
  workRequestFingerprint,
  STATUSES,
  ACTIVE_STATUSES,
  statusFrom,
  promptTitle,
  typeFrom,
  checkPrompt,
  type Status,
  type WorkRequestType,
} from './story.js';
import { parseIdentifier, type RepositoryTarget } from '../projects/repository.js';
import { Breakdown } from './breakdown.js';
import { AuthorRights } from './author-rights.js';
import { ensureLabel } from './labels.js';
import { frozenFromIssue, labelNames, summarize, type StoryDetail, type Issue, type Message, type Person, type StorySummary } from './story-summary.js';
import { WorkRequestStore, type FrozenWorkRequest, type LogMessage } from './work-requests.js';

/** Marks the comments written by the assistant, to rebuild the exchanges. */
export const ASSISTANT_MARKER = '<!-- atelier-po:assistant -->';
import { LAUNCH_MARKER } from './story.js';
/** Marks the launch comment: the exchanges useful to the agent start after it. */
export { LAUNCH_MARKER } from './story.js';
/** Start of the launch comment (“depuis ADA”, or “depuis l’atelier PO” before the renaming). */
export const LAUNCH_START = '▶️ Lancée depuis ';

export type { StoryDetail, Message, Person, StorySummary } from './story-summary.js';

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);

  private readonly rights: AuthorRights;
  private readonly breakdown: Breakdown;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly workRequests: WorkRequestStore,
  ) {
    this.rights = new AuthorRights((repository) => this.target(repository));
    this.breakdown = new Breakdown(this, github, workRequests, (repository) => this.target(repository));
  }

  /**
   * Status of a request: the one ADA saved, never the one of GitHub's labels (which anyone
   * with rights on the repository can change). A closed request is delivered. As long as
   * the statuses already set on GitHub have not been recovered (first pass), the labels are authoritative.
   */
  private async statusOf(repository: string, issue: Issue, recovered: boolean): Promise<Status> {
    if (issue.state === 'closed') return 'delivered';
    const saved = await this.workRequests.readStatus(repository, issue.number);
    if (saved) return saved;
    return recovered ? 'new' : statusFrom('open', labelNames(issue.labels));
  }

  /** First pass on a project: the statuses the labels carried so far become ADA's. */
  private async recoverStatuses(repository: string, issues: Issue[]): Promise<void> {
    for (const issue of issues) {
      if (issue.state === 'closed') continue;
      const status = statusFrom('open', labelNames(issue.labels));
      if (status !== 'new' && !(await this.workRequests.readStatus(repository, issue.number))) await this.workRequests.writeStatus(repository, issue.number, status);
    }
    await this.workRequests.markStatusesRecovered(repository);
  }

  /** The request starts: frozen as it is, “in progress” status, and the launch opens the log of the exchanges. */
  private async saveLaunch(repository: string, frozenRequest: FrozenWorkRequest, login: string, text: string): Promise<void> {
    await this.workRequests.freeze(repository, frozenRequest);
    await this.workRequests.writeStatus(repository, frozenRequest.number, 'in-progress');
    await this.workRequests.addMessage(repository, frozenRequest.number, { author: login, text });
  }

  /** GitHub account and repository of an ADA project (see projects/repository.ts). */
  private target(repository: string): RepositoryTarget {
    return parseIdentifier(repository, this.config.GITHUB_OWNER);
  }

  /**
   * Stories and bugs written in GitHub, from most recent to oldest: issues bearing the
   * label, or written with the form even if the label was missing in the repository. A request
   * closed without being implemented (duplicate, abandoned) does not appear: it was not delivered.
   */
  async list(token: string, repository: string): Promise<StorySummary[]> {
    const gh = this.github.client(token);
    try {
      const issues = (await gh.paginate(gh.issues.listForRepo, {
        ...this.target(repository),
        state: 'all',
        per_page: 100,
      })) as Issue[];
      const retained = issues
        .filter((i) => !i.pull_request && i.state_reason !== 'not_planned' && typeFrom(labelNames(i.labels), i.body ?? '') !== null)
        .sort((a, b) => b.number - a.number);
      // One GitHub call per author (kept 5 minutes), not per issue.
      const trustByAuthor = new Map<string, boolean>();
      await Promise.all(
        [...new Set(retained.map((i) => `${i.author_association ?? ''}|${i.user?.login ?? ''}`))].map(async (key) => {
          const [link = '', login = ''] = key.split('|');
          trustByAuthor.set(key, await this.rights.reliable(gh, repository, link, login));
        }),
      );
      if (!(await this.workRequests.areStatusesRecovered(repository))) await this.recoverStatuses(repository, retained);
      return Promise.all(
        retained.map(async (i) => summarize(i, trustByAuthor.get(`${i.author_association ?? ''}|${i.user?.login ?? ''}`) ?? false, await this.statusOf(repository, i, true))),
      );
    } catch (e) {
      translateGithubError(e);
    }
  }

  /**
   * Detail of a request. Once launched, it is displayed as ADA froze it, with the log
   * of the exchanges made through the interface: a comment written by hand on GitHub does not appear
   * (it would not imitate ADA and would not reach the agent). Before the launch, or for a request
   * launched before this change, GitHub is read, keeping only the trusted authors.
   */
  async detail(token: string, repository: string, number: number): Promise<StoryDetail> {
    const gh = this.github.client(token);
    try {
      const [frozenRequest, log, recovered] = await Promise.all([this.workRequests.readFrozen(repository, number), this.workRequests.messages(repository, number), this.workRequests.areStatusesRecovered(repository)]);
      const usesLog = frozenRequest !== null && log.length > 0;
      const [{ data: issue }, comments] = await Promise.all([
        gh.issues.get({ ...this.target(repository), issue_number: number }),
        usesLog ? Promise.resolve(null) : gh.issues.listComments({ ...this.target(repository), issue_number: number, per_page: 100 }).then((response) => response.data),
      ]);
      const body = issue.body ?? '';
      const authors = new Map<string, boolean>();
      const reliable = async (link: string | null | undefined, login: string | null | undefined) => {
        const key = `${link ?? ''}|${login ?? ''}`;
        if (!authors.has(key)) authors.set(key, await this.rights.reliable(gh, repository, link, login));
        return authors.get(key)!;
      };
      const trustedIssue = await reliable((issue as Issue).author_association, (issue as Issue).user?.login);
      const summary = summarize(issue as Issue, trustedIssue, await this.statusOf(repository, issue as Issue, recovered));
      const launched = frozenRequest !== null && summary.status !== 'new' && summary.status !== 'waiting';

      let messages: Message[];
      if (usesLog) {
        messages = log.map((message: LogMessage) => ({ id: message.id, author: message.author, avatar: null, text: message.text, at: message.at }));
      } else {
        // Only the comments of people with write access to the project count.
        const kept: NonNullable<typeof comments> = [];
        for (const c of comments ?? []) if (await reliable(c.author_association, c.user?.login)) kept.push(c);
        messages = kept.map((c) => ({ id: c.id, author: c.user?.login ?? 'unknown', avatar: c.user?.avatar_url ?? null, text: c.body ?? '', at: c.created_at }));
      }
      return {
        ...summary,
        ...(launched ? { title: frozenRequest.title, type: frozenRequest.type, parent: frozenRequest.parent } : {}),
        content: launched ? frozenRequest.content : readStory(body),
        bugContent: launched ? frozenRequest.bugContent : readBug(body),
        freeContent: launched ? frozenRequest.freeContent : (readPrompt(body) ?? readConversation(body)),
        rawText: body,
        assignees: (issue.assignees ?? []).map((person) => ({ login: person.login, avatar: person.avatar_url ?? null })),
        messages,
        fingerprint: workRequestFingerprint(issue.title, body),
        // Any comment of the issue that is not a copy of a log message was written by hand on GitHub.
        ignoredComments: usesLog ? Math.max(0, (issue.comments ?? 0) - log.length) : 0,
      };
    } catch (e) {
      translateGithubError(e);
    }
  }

  /**
   * What the agent reads for a request: the request frozen at launch and ADA's log of the
   * exchanges. Never the live issue. Request launched before this change: one-time recovery from
   * GitHub (trusted authors only), then ADA no longer reads anything written there.
   */
  async frozenWorkRequest(token: string, repository: string, number: number): Promise<{ frozen: FrozenWorkRequest; messages: LogMessage[] }> {
    const [frozenRequest, log] = await Promise.all([this.workRequests.readFrozen(repository, number), this.workRequests.messages(repository, number)]);
    if (frozenRequest && log.length) return { frozen: frozenRequest, messages: log };
    const legacy = await this.detail(token, repository, number);
    const frozen = frozenRequest ?? {
      number,
      title: legacy.title,
      type: legacy.type,
      content: legacy.content,
      bugContent: legacy.bugContent,
      freeContent: legacy.freeContent,
      parent: legacy.parent,
      launchedAt: new Date().toISOString(),
      launchedBy: 'adoption',
    };
    if (!frozenRequest) await this.workRequests.freeze(repository, frozen);
    if (!log.length) for (const message of legacy.messages) await this.workRequests.addMessage(repository, number, { author: message.author, text: message.text });
    return { frozen, messages: await this.workRequests.messages(repository, number) };
  }

  /** People who can be assigned to the issues of the repository (access to the project). */
  async developers(token: string, repository: string): Promise<Person[]> {
    const gh = this.github.client(token);
    try {
      const people = await gh.paginate(gh.issues.listAssignees, { ...this.target(repository), per_page: 100 });
      return people
        .map((person) => ({ login: person.login, avatar: person.avatar_url ?? null }))
        .sort((first, second) => first.login.localeCompare(second.login));
    } catch (e) {
      translateGithubError(e);
    }
  }

  /**
   * Assigns a developer to a blocked request (“Needs a developer”), replacing
   * any existing assignment; `null` removes the assignment (possible at any time). ADA does not
   * notify the developer: they were told some other way.
   */
  async assign(token: string, repository: string, number: number, login: unknown): Promise<StoryDetail> {
    if (login !== null && (typeof login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(login))) {
      throw new BadRequestException('Choisissez un développeur dans la liste');
    }
    const gh = this.github.client(token);
    const { data: issue } = await gh.issues.get({ ...this.target(repository), issue_number: number }).catch((e: unknown) => translateGithubError(e));
    if (login !== null) {
      if ((await this.statusOf(repository, issue as Issue, await this.workRequests.areStatusesRecovered(repository))) !== 'needs-developer') {
        throw new BadRequestException('On assigne un développeur seulement à une demande bloquée (« Besoin d’un développeur »)');
      }
      if (!(await this.developers(token, repository)).some((person) => person.login === login)) {
        throw new BadRequestException(`${login} n’a pas accès au projet : il ne peut pas être assigné`);
      }
    }
    try {
      const otherAssignees = (issue.assignees ?? []).map((person) => person.login).filter((assignee) => assignee !== login);
      if (otherAssignees.length) await gh.issues.removeAssignees({ ...this.target(repository), issue_number: number, assignees: otherAssignees });
      if (login !== null) await gh.issues.addAssignees({ ...this.target(repository), issue_number: number, assignees: [login] });
    } catch (e) {
      translateGithubError(e);
    }
    return this.detail(token, repository, number);
  }
  /**
   * Wild mode: the prompt becomes a “mode-libre” issue (trace in GitHub), launched right
   * away. Same rules as a story: only one active request per project.
   */
  async submitPrompt(token: string, repository: string, text: unknown, login: string): Promise<StorySummary> {
    const verification = checkPrompt(text);
    if (!verification.ok) throw new BadRequestException({ errors: { text: verification.error } });
    return this.createAndLaunch(token, repository, login, { type: 'free', label: FREE_LABEL, title: promptTitle(verification.text), body: formatPrompt(verification.text), mode: 'mode sauvage' });
  }

  /**
   * Conversation (“real prompt”): the first message becomes a “mode-conversation” issue,
   * launched right away. Only one active request per project, like the rest.
   */
  async openConversation(token: string, repository: string, text: unknown, login: string): Promise<StorySummary> {
    const verification = checkMessage(text, true);
    if (!verification.ok) throw new BadRequestException({ errors: { text: verification.error } });
    return this.createAndLaunch(token, repository, login, { type: 'conversation', label: CONVERSATION_LABEL, title: conversationTitle(verification.text), body: formatConversation(verification.text), mode: 'conversation' });
  }

  /** Creates the issue of a request written in ADA (wild mode, conversation) and launches it at once. */
  private async createAndLaunch(
    token: string,
    repository: string,
    login: string,
    workRequest: { type: WorkRequestType; label: string; title: string; body: string; mode: string },
  ): Promise<StorySummary> {
    const active = (await this.list(token, repository)).find((s) => ACTIVE_STATUSES.includes(s.status));
    if (active) {
      throw new ConflictException(`La demande #${active.number} « ${active.title} » est en cours : une seule demande à la fois`);
    }
    const gh = this.github.client(token);
    try {
      await ensureLabel(gh, this.target(repository), workRequest.label);
      await ensureLabel(gh, this.target(repository), STATUSES['in-progress']);
      const { data } = await gh.issues.create({ ...this.target(repository), title: workRequest.title, body: workRequest.body, labels: [workRequest.label, STATUSES['in-progress']] });
      const launch = `${LAUNCH_MARKER} par ${login} (${workRequest.mode}).`;
      await gh.issues.createComment({ ...this.target(repository), issue_number: data.number, body: launch });
      await this.saveLaunch(repository, frozenFromIssue(data as Issue, workRequest.type, login), login, launch);
      return summarize(data as Issue, true, 'in-progress'); // created just now by the signed-in PO
    } catch (e) {
      translateGithubError(e);
    }
  }

  /** Closes a request without implementing it (“not planned”): it disappears from the list, without being delivered. */
  async closeAsNotPlanned(token: string, repository: string, number: number, comment: string): Promise<void> {
    const gh = this.github.client(token);
    try {
      await this.workRequests.addMessage(repository, number, { author: 'ADA', text: comment });
      await this.workRequests.clearStatus(repository, number);
      await gh.issues.createComment({ ...this.target(repository), issue_number: number, body: comment });
      const { data } = await gh.issues.get({ ...this.target(repository), issue_number: number });
      const keep = labelNames((data as Issue).labels).filter((l) => !l.startsWith('story:'));
      await gh.issues.update({ ...this.target(repository), issue_number: number, state: 'closed', state_reason: 'not_planned', labels: keep });
    } catch (e) {
      translateGithubError(e);
    }
  }

  /** Launches (or relaunches, if it was on hold) a request: only one at a time per project, and only if it is ready. */
  async launch(token: string, repository: string, number: number, login: string, fingerprint?: unknown): Promise<StorySummary> {
    const all = await this.list(token, repository);
    const target = all.find((s) => s.number === number);
    if (!target) throw new BadRequestException(`La demande #${number} n’est ni une story ni un problème de l’atelier`);
    if (target.status !== 'new' && target.status !== 'waiting') throw new ConflictException(`La demande #${number} est déjà lancée ou terminée`);
    if (!target.ready) throw new BadRequestException(`La demande #${number} n’est pas prête : ${target.reason}`);
    const active = all.find((s) => ACTIVE_STATUSES.includes(s.status));
    if (active) {
      throw new ConflictException(
        `La demande #${active.number} « ${active.title} » est en cours : une seule demande à la fois`,
      );
    }
    // The fingerprint tells what the PO read on screen: without it, what they launch is unknown.
    if (typeof fingerprint !== 'string' || !fingerprint) throw new BadRequestException('Ouvrez la demande dans ADA et relisez-la avant de la lancer');
    const gh = this.github.client(token);
    // The issue as it is now: it is the one that will be frozen, and it must be the one the PO read.
    const { data: issue } = await gh.issues.get({ ...this.target(repository), issue_number: number }).catch((e: unknown) => translateGithubError(e));
    if (fingerprint !== workRequestFingerprint(issue.title, issue.body)) {
      throw new ConflictException('Cette demande a été modifiée sur GitHub depuis que vous l’avez ouverte. Relisez-la, puis lancez-la de nouveau.');
    }
    // “Ready” is judged on what is about to be frozen, not on the list read a moment earlier.
    const fresh = summarize(issue as Issue, target.reliable, target.status);
    if (!fresh.ready) throw new BadRequestException(`La demande #${number} n’est pas prête : ${fresh.reason}`);
    try {
      const typeLabel = { bug: BUG_LABEL, free: FREE_LABEL, conversation: CONVERSATION_LABEL, story: STORY_LABEL }[fresh.type];
      await ensureLabel(gh, this.target(repository), typeLabel);
      await ensureLabel(gh, this.target(repository), STATUSES['in-progress']);
      await gh.issues.addLabels({
        ...this.target(repository),
        issue_number: number,
        labels: [typeLabel, STATUSES['in-progress']],
      });
      if (target.status === 'waiting') await gh.issues.removeLabel({ ...this.target(repository), issue_number: number, name: STATUSES.waiting });
      const launch = `${LAUNCH_MARKER} par ${login}.`;
      await gh.issues.createComment({ ...this.target(repository), issue_number: number, body: launch });
      // The request is frozen as the PO read it: the agent will never read the live issue.
      await this.saveLaunch(repository, frozenFromIssue(issue as Issue, fresh.type, login), login, launch);
    } catch (e) {
      translateGithubError(e);
    }
    return { ...fresh, status: 'in-progress' };
  }

  /**
   * Changes the status: ADA saves it first (it is authoritative), then copies the label onto
   * the issue for those who read it on GitHub. A failing copy changes nothing to the work.
   */
  async changeStatus(token: string, repository: string, number: number, status: keyof typeof STATUSES): Promise<void> {
    await this.workRequests.writeStatus(repository, number, status);
    const gh = this.github.client(token);
    try {
      const { data } = await gh.issues.get({ ...this.target(repository), issue_number: number });
      const others = labelNames((data as Issue).labels).filter((l) => !l.startsWith('story:'));
      await ensureLabel(gh, this.target(repository), STATUSES[status]);
      await gh.issues.setLabels({ ...this.target(repository), issue_number: number, labels: [...others, STATUSES[status]] });
    } catch (e) {
      this.logger.warn(`Status label of ${repository}#${number} not copied to GitHub: ${(e as Error).message}`);
    }
  }

  /** Delivered request: no current status any more (the closed issue is enough), copied to GitHub. */
  async removeStatus(token: string, repository: string, number: number): Promise<void> {
    await this.workRequests.clearStatus(repository, number);
    const gh = this.github.client(token);
    try {
      const { data } = await gh.issues.get({ ...this.target(repository), issue_number: number });
      const keep = labelNames((data as Issue).labels).filter((l) => !l.startsWith('story:'));
      await gh.issues.setLabels({ ...this.target(repository), issue_number: number, labels: keep });
    } catch (e) {
      this.logger.warn(`Labels of ${repository}#${number} not removed on GitHub: ${(e as Error).message}`);
    }
  }
  /** Breakdown approved by the PO (#36): see breakdown.ts. */
  createBreakdown(token: string, repository: string, number: number, inputs: unknown, login: string): Promise<StorySummary[]> {
    return this.breakdown.create(token, repository, number, inputs, login);
  }

  /** Delivered story: if it comes from a breakdown, tick it in its parent request (see breakdown.ts). */
  reportDeliveryToParent(token: string, repository: string, number: number): Promise<void> {
    return this.breakdown.reportDelivery(token, repository, number);
  }

  /**
   * Message from ADA: recorded first in ADA's log (it is the one the screen and the agent
   * read back), then copied onto the issue for the team, with the marker that identifies it.
   */
  async commentAsAssistant(token: string, repository: string, number: number, title: string, text: string): Promise<void> {
    const body = `${ASSISTANT_MARKER}\n🤖 **${title}**\n\n${text}`;
    await this.workRequests.addMessage(repository, number, { author: 'ADA', text: body });
    try {
      await this.github.client(token).issues.createComment({ ...this.target(repository), issue_number: number, body: body });
    } catch (e) {
      translateGithubError(e);
    }
  }

  /** Message from the PO, written in ADA: published on the issue under their name, then recorded. A refusal from GitHub leaves nothing in the log. */
  async reply(token: string, repository: string, number: number, text: string): Promise<Message> {
    const clean = (text ?? '').trim();
    if (!clean) throw new BadRequestException({ errors: { text: 'Le message est vide' } });
    try {
      const { data: c } = await this.github.client(token).issues.createComment({
        ...this.target(repository),
        issue_number: number,
        body: clean,
      });
      await this.workRequests.addMessage(repository, number, { author: c.user?.login ?? 'unknown', text: clean });
      return { id: c.id, author: c.user?.login ?? 'unknown', avatar: c.user?.avatar_url ?? null, text: c.body ?? '', at: c.created_at };
    } catch (e) {
      translateGithubError(e);
    }
  }
}
