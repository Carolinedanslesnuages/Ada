/** Analysis phase: questions, plan, breakdown or waiting, published in the issue; no change to the code. */
import { breakdownText } from '../stories/story.js';
import type { Task } from './agent.js';
import { analysisInstructions } from './instructions.js';
import type { PhaseTools } from './phase-tools.js';
import { readDecision, questionsText } from './responses.js';
import { isLargeWorkRequest, breakdownRetry } from './breakdown-retry.js';
import { isCopiedFromFile, readInstructionFiles, SUSPICIOUS_FILE_RETRY } from './injection-guard.js';

export async function analysisPhase(tools: PhaseTools, { token, login, repository, number }: Task): Promise<void> {
  const { stories } = tools;
  await tools.record(repository, number, 'Prépare le projet');
  const cwd = await tools.preview.prepareRepository(token, repository);
  const skills = await tools.equipSkills(cwd);
  await tools.record(repository, number, 'Lit la story et le projet');
  const { dsfr } = await tools.preview.readConfig(cwd);
  const workRequest = { ...(await tools.workRequest(token, repository, number)), existingStories: await tools.existingStories(token, repository, number) };
  const instructions = analysisInstructions(workRequest, await tools.readRgaaIndex(), skills.names, dsfr);
  const response = await tools.run(repository, number, 'analysis', instructions, cwd, skills.folders, null, login);
  let decision = readDecision(response);
  // A large request calls for a breakdown, not questions: it is asked for once more
  // (smaller models ask questions instead of breaking down a long text or one with several deliverables).
  if (decision?.decision === 'questions' && isLargeWorkRequest(workRequest, decision.text)) {
    await tools.record(repository, number, 'La demande est vaste : prépare un découpage');
    const second = await tools.run(repository, number, 'analysis', instructions + breakdownRetry(decision.text), cwd, skills.folders, null, login);
    const splitAgain = readDecision(second);
    if (splitAgain?.decision === 'breakdown') decision = splitAgain;
  }
  // An answer that copies a text of the project as is comes from the file, not from the agent: a second chance, then it is blocked.
  const instructionFiles = await readInstructionFiles(cwd);
  if (decision && isCopiedFromFile(decision.text, instructionFiles)) {
    await tools.record(repository, number, 'Un fichier du projet a dicté la réponse : nouvelle analyse');
    const retried = await tools.run(repository, number, 'analysis', instructions + SUSPICIOUS_FILE_RETRY, cwd, skills.folders, null, login);
    const retriedDecision = readDecision(retried);
    decision = retriedDecision && !isCopiedFromFile(retriedDecision.text, instructionFiles) ? retriedDecision : null;
    if (!decision) {
      await tools.block(token, repository, number, 'Un fichier du projet (AGENTS.md, PROJET.md ou README.md) contient un ordre adressé à l’assistant : ADA ne l’a pas suivi. À faire relire par un développeur.');
      return;
    }
  }
  if (!decision) {
    await tools.block(token, repository, number, 'ADA n’a pas réussi à analyser la demande.');
    return;
  }
  if (decision.decision === 'breakdown') {
    await stories.commentAsAssistant(token, repository, number, 'Découpage proposé', breakdownText(decision.text, decision.stories ?? []));
    await stories.changeStatus(token, repository, number, 'breakdown');
    await tools.record(repository, number, 'Attend que vous choisissiez les stories à créer');
    return;
  }
  if (decision.decision === 'waiting') {
    await stories.commentAsAssistant(token, repository, number, 'Demande mise en attente', decision.text);
    await stories.changeStatus(token, repository, number, 'waiting');
    await tools.record(repository, number, 'En attente : à relancer quand ce qu’elle attend sera livré');
    return;
  }
  const questions = decision.decision === 'questions';
  await stories.commentAsAssistant(token, repository, number, questions ? 'Questions d’ADA' : 'Plan proposé', questionsText(decision));
  await stories.changeStatus(token, repository, number, questions ? 'questions' : 'plan-to-approve');
  await tools.record(repository, number, questions ? 'Attend vos réponses' : 'Attend que vous validiez le plan');
}
