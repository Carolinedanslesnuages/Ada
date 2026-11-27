/** Implementation phase: the approved plan is implemented on a branch, then the branch is pushed and the PR opened. */
import { branchOf, type Task } from './agent.js';
import { implementationInstructions } from './instructions.js';
import type { PhaseTools } from './phase-tools.js';
import { readResult } from './responses.js';

const ADOPTION =
  '\n\nReprise : une exécution précédente a été interrompue. Les fichiers modifiés ou non suivis de la branche (git status) sont ce travail en cours : vérifie-les et continue, sans repartir de zéro.';

export async function implementationPhase(tools: PhaseTools, { token, login, repository, number }: Task): Promise<void> {
  const workRequest = await tools.workRequest(token, repository, number);
  const branch = branchOf(workRequest);
  const { cwd, isWorkResumed } = await tools.prepareBranch(token, login, repository, branch);
  const skills = await tools.equipSkills(cwd);
  await tools.record(repository, number, isWorkResumed ? `Reprend le travail interrompu sur ${branch}` : `Travaille sur la branche ${branch}`);
  const { checks, dsfr } = await tools.preview.readConfig(cwd);
  const instructions = implementationInstructions(workRequest, branch, await tools.readRgaaIndex(), skills.names, checks, dsfr) + (isWorkResumed ? ADOPTION : '');
  const response = await tools.run(repository, number, 'implementation', instructions, cwd, skills.folders, null, login);
  const result = readResult(response);
  if (!result || result.result === 'blocked') {
    await tools.block(token, repository, number, result?.result === 'blocked' ? result.reason : 'ADA n’a pas terminé la réalisation.');
    return;
  }
  if ((await tools.countCommits(cwd, `origin/main..${branch}`)) === 0) {
    await tools.block(token, repository, number, 'ADA n’a enregistré aucune modification.');
    return;
  }
  if (await tools.touchesReservedFolders(token, repository, number, cwd, branch)) return;
  await tools.push(token, repository, number, cwd, branch);
  const pr = await tools.openPullRequest(token, repository, cwd, branch, workRequest, result.summary);
  await tools.save(repository, number, { pullRequest: pr });
  await tools.stories.commentAsAssistant(token, repository, number, 'Réalisation terminée', `${result.summary}\n\nLes contrôles automatiques tournent sur la pull request : ${pr}`);
  await tools.restartPreview(repository, number);
  await tools.stories.changeStatus(token, repository, number, 'in-review');
  await tools.record(repository, number, 'Terminé : à vous de vérifier');
}
