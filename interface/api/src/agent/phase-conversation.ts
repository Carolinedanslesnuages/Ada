/**
 * Conversation phase (“real prompt”): ADA answers the PO's last message by acting right
 * away on its branch; at “all good”, full checks then PR.
 */
import { randomUUID } from 'node:crypto';
import { breakdownText } from '../stories/story.js';
import { branchOf, type WorkRequest, type Task } from './agent.js';
import { conversationInstructions, conversationFollowUpInstructions } from './instructions.js';
import type { PhaseTools } from './phase-tools.js';
import { readConversationEnd, type ConversationEnd } from './responses.js';

export async function conversationPhase(tools: PhaseTools, { token, login, repository, number, finalize = false }: Task): Promise<void> {
  const workRequest = await tools.workRequest(token, repository, number);
  const branch = branchOf(workRequest);
  const { cwd } = await tools.prepareBranch(token, login, repository, branch);
  const skills = await tools.equipSkills(cwd);
  await tools.record(repository, number, finalize ? 'Lance les contrôles complets avant de proposer vos changements' : `Lit votre message (branche ${branch})`);
  const { checks, dsfr } = await tools.preview.readConfig(cwd);
  const rgaaIndex = await tools.readRgaaIndex();
  const runConversation = async (instructions: string, session: { id: string; resume: boolean }) =>
    readConversationEnd(await tools.run(repository, number, 'conversation', instructions, cwd, skills.folders, session, login));

  // Keeping the thread: the agent session is resumed from one message to the next (it already has the rules
  // and the history); without a session, or if it can no longer be resumed, the full instructions are sent again.
  const previous = (await tools.readActivity(repository, number)).session ?? null;
  const lastMessage = [...workRequest.exchanges].reverse().find((exchange) => exchange.author === 'po')?.text;
  let end: ConversationEnd | null = null;
  if (previous && lastMessage) {
    end = await runConversation(conversationFollowUpInstructions(lastMessage, checks, finalize), { id: previous, resume: true }).catch((e: unknown) => {
      tools.log.warn(`Session of ${repository}#${number} could not be resumed: ${(e as Error).message}`);
      return null;
    });
  }
  if (!end) {
    const session = randomUUID();
    await tools.save(repository, number, { session });
    end = await runConversation(conversationInstructions(workRequest, branch, rgaaIndex, skills.names, checks, dsfr, finalize), { id: session, resume: false });
  }
  if (!end) {
    await tools.block(token, repository, number, 'ADA n’a pas réussi à répondre à votre message.');
    return;
  }
  // Commits not yet on GitHub: the branch is pushed (never main) and the preview shows them.
  if ((await tools.countCommits(cwd, branch, '--not', '--remotes=origin')) > 0) {
    if (await tools.touchesReservedFolders(token, repository, number, cwd, branch)) return;
    await tools.push(token, repository, number, cwd, branch);
    await tools.restartPreview(repository, number);
  }
  if (!finalize) {
    // Stories for later: attached to the message, the PO chooses them and ADA publishes them (same path as a breakdown).
    const message = end.stories.length ? breakdownText(end.response, end.stories) : end.response;
    await tools.stories.commentAsAssistant(token, repository, number, 'ADA', message);
    await tools.stories.changeStatus(token, repository, number, 'exchange');
    await tools.record(repository, number, 'À vous : répondez à ADA');
    return;
  }
  await proposeChanges(tools, { token, login, repository, number }, cwd, branch, workRequest, end);
}

/**
 * End of conversation (“all good”): full checks passed → PR (usual path:
 * review and merge by the PO); no change → conversation closed; failed check →
 * ADA says so and the conversation stays open.
 */
async function proposeChanges(
  tools: PhaseTools,
  { token, login, repository, number }: Pick<Task, 'token' | 'login' | 'repository' | 'number'>,
  cwd: string,
  branch: string,
  workRequest: WorkRequest,
  end: ConversationEnd,
): Promise<void> {
  const { stories } = tools;
  if (!end.ready) {
    await stories.commentAsAssistant(token, repository, number, 'Pas encore prêt', `${end.response}\n\nDites-moi comment continuer, ou demandez l’aide d’un développeur.`);
    await stories.changeStatus(token, repository, number, 'exchange');
    await tools.record(repository, number, 'Un contrôle ne passe pas : à vous');
    return;
  }
  if ((await tools.countCommits(cwd, `origin/main..${branch}`)) === 0) {
    await stories.closeAsNotPlanned(token, repository, number, `💬 Conversation terminée par ${login}, sans changement à proposer au projet.`);
    return;
  }
  const pr = await tools.openPullRequest(token, repository, cwd, branch, workRequest, end.response);
  await tools.save(repository, number, { pullRequest: pr });
  await stories.commentAsAssistant(token, repository, number, 'Changements proposés au projet', `${end.response}\n\nLes contrôles automatiques tournent sur la pull request : ${pr}`);
  await stories.changeStatus(token, repository, number, 'in-review');
  await tools.record(repository, number, 'Terminé : à vous de vérifier');
}
