/**
 * Breakdown of a request (#36): the stories approved by the PO are published under their name, the
 * original request becomes their parent, and closes when all are delivered.
 */
import { ConflictException } from '@nestjs/common';
import { translateGithubError } from '../github/errors.js';
import type { GithubService } from '../github/github.service.js';
import type { RepositoryTarget } from '../projects/repository.js';
import type { WorkRequestStore } from './work-requests.js';
import { ensureLabel } from './labels.js';
import { summarize, type Issue, type StorySummary } from './story-summary.js';
import type { StoriesService } from './stories.service.js';
import { addBreakdown, checkChild, formatStory, STORY_LABEL, readParent, BREAKDOWN_MARKER, validateStoriesToPublish } from './story.js';

export class Breakdown {
  constructor(
    private readonly stories: Pick<StoriesService, 'detail' | 'changeStatus' | 'removeStatus'>,
    private readonly github: GithubService,
    private readonly workRequests: WorkRequestStore,
    private readonly target: (repository: string) => RepositoryTarget,
  ) {}

  /**
   * Breakdown approved by the PO (#36): ADA publishes, under their name, the stories they ticked — as
   * they reviewed and possibly corrected them (fields prefilled by the assistant) — and the
   * original request becomes their parent (checklist, closed when all are delivered).
   * In conversation, the stories proposed by ADA are published without a parent: the conversation goes on.
   */
  async create(token: string, repository: string, number: number, inputs: unknown, login: string): Promise<StorySummary[]> {
    const parent = await this.stories.detail(token, repository, number);
    // Conversation: stories proposed by ADA in its last message (the conversation goes on).
    const inConversation = parent.type === 'conversation';
    if (inConversation) {
      const last = parent.messages.at(-1);
      if (parent.status !== 'exchange' || !last?.text.includes(BREAKDOWN_MARKER)) {
        throw new ConflictException('Aucune story proposée par ADA n’attend votre choix dans cette conversation');
      }
    } else if (parent.status !== 'breakdown') throw new ConflictException('Aucun découpage n’attend votre choix sur cette demande');
    const stories = validateStoriesToPublish(inputs);
    const gh = this.github.client(token);
    const created: StorySummary[] = [];
    try {
      await ensureLabel(gh, this.target(repository), STORY_LABEL);
      for (const story of stories) {
        const { data } = await gh.issues.create({
          ...this.target(repository),
          title: story.title,
          body: formatStory(story, number, inConversation ? 'conversation' : 'breakdown'),
          labels: [STORY_LABEL],
        });
        created.push(summarize(data as Issue, true, 'new'));
      }
      if (inConversation) {
        const notice = `📝 Stories publiées par ${login} : ${created.map((story) => `#${story.number}`).join(', ')}, créées depuis ADA à partir de la conversation.`;
        await this.workRequests.addMessage(repository, number, { author: login, text: notice });
        await gh.issues.createComment({ ...this.target(repository), issue_number: number, body: notice });
        return created;
      }
      const { data: parentIssue } = await gh.issues.get({ ...this.target(repository), issue_number: number });
      await gh.issues.update({
        ...this.target(repository),
        issue_number: number,
        body: addBreakdown(parentIssue.body ?? '', created.map((story) => ({ number: story.number, title: story.title }))),
      });
      const notice = `✂️ Découpage validé par ${login} : ${created.map((story) => `#${story.number}`).join(', ')} créées depuis ADA.`;
      await this.workRequests.addMessage(repository, number, { author: login, text: notice });
      await gh.issues.createComment({ ...this.target(repository), issue_number: number, body: notice });
      await this.stories.changeStatus(token, repository, number, 'parent');
    } catch (e) {
      translateGithubError(e);
    }
    return created;
  }

  /** Delivered story: if it comes from a breakdown, tick it in its parent request, closed when everything is delivered. */
  async reportDelivery(token: string, repository: string, number: number): Promise<void> {
    const gh = this.github.client(token);
    try {
      const { data: child } = await gh.issues.get({ ...this.target(repository), issue_number: number });
      const parentNumber = readParent(child.body ?? '');
      if (!parentNumber) return;
      const { data: parent } = await gh.issues.get({ ...this.target(repository), issue_number: parentNumber });
      const { body, allDelivered } = checkChild(parent.body ?? '', number);
      if (body !== parent.body) await gh.issues.update({ ...this.target(repository), issue_number: parentNumber, body: body });
      if (allDelivered && parent.state === 'open') {
        const notice = '✅ Toutes les stories du découpage sont livrées.';
        await this.workRequests.addMessage(repository, parentNumber, { author: 'ADA', text: notice });
        await gh.issues.createComment({ ...this.target(repository), issue_number: parentNumber, body: notice });
        await gh.issues.update({ ...this.target(repository), issue_number: parentNumber, state: 'closed', state_reason: 'completed' });
        await this.stories.removeStatus(token, repository, parentNumber);
      }
    } catch (e) {
      translateGithubError(e);
    }
  }
}
