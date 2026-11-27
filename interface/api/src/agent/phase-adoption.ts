/**
 * Adoption of an existing project (#37): the assistant analyses the project as if it had been created
 * with ADA, then ADA opens the adoption PR (deduced ada.json) and proposes the improvements.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseIdentifier } from '../projects/repository.js';
import type { ProjectsService } from '../projects/projects.service.js';
import { adoptionAdaJson, adoptionBody, filesToBring, REFERENCE_MODEL, openAdoptionPullRequest } from '../projects/adoption.js';
import { breakdownText } from '../stories/story.js';
import type { Task } from './agent.js';
import { adoptionInstructions, readAdoptionAnalysis } from './adoption-instructions.js';
import type { PhaseTools } from './phase-tools.js';

export async function adoptionPhase(tools: PhaseTools, projects: ProjectsService, { token, login, repository, number, adoption }: Task): Promise<void> {
  const { stories } = tools;
  const { template = null, dsfr = false } = adoption ?? {};
  const stack = template ? projects.templates().templates.find((m) => m.id === template && m.available) : undefined;
  const templateFolder = join(projects.catalogFolder, stack?.id ?? REFERENCE_MODEL);
  const templateAda = stack ? await readFile(join(templateFolder, 'ada.json'), 'utf8') : null;

  await tools.record(repository, number, 'Prépare le projet');
  const cwd = await tools.preview.prepareRepository(token, repository);
  const skills = await tools.equipSkills(cwd);
  await tools.record(repository, number, 'Compare le projet à un projet créé avec ADA');
  const instructions = adoptionInstructions({ stack: stack && templateAda ? { label: stack.label, ada: templateAda } : null, dsfr }, skills.names);
  const analysis = readAdoptionAnalysis(await tools.run(repository, number, 'adoption', instructions, cwd, skills.folders, null, login));
  if (!analysis) {
    await tools.block(token, repository, number, 'ADA n’a pas réussi à analyser le projet.');
    return;
  }

  // Preview: the one deduced by the analysis; failing that, the one of the stack given by the PO.
  let adaJson: string | null = null;
  for (const source of [analysis.ada, templateAda]) {
    if (adaJson || !source) continue;
    try {
      adaJson = adoptionAdaJson(source, dsfr);
    } catch (e) {
      tools.log.warn(`Adoption ada.json discarded (${repository}): ${(e as Error).message.split('\n')[0]}`);
    }
  }
  if (!adaJson) {
    await stories.commentAsAssistant(token, repository, number, 'Analyse de la reprise', analysis.text);
    await tools.block(token, repository, number, 'ADA n’a pas trouvé comment démarrer l’aperçu du projet : un développeur doit le décrire (ada.json).');
    return;
  }

  await tools.record(repository, number, 'Ouvre la pull request de reprise');
  const { owner, repo } = parseIdentifier(repository, tools.config.GITHUB_OWNER);
  const gh = tools.github.client(token);
  const files = await filesToBring(gh, owner, repo, { base: projects.baseFolder, template: templateFolder }, adaJson);
  const parsedUrl = `https://github.com/${owner}/${repo}/issues/${number}`;
  const pr = await openAdoptionPullRequest(gh, { owner, repo, login }, files, adoptionBody({ stack: stack?.label ?? null, files: [...files.keys()], login, dsfr, analysis: parsedUrl }));
  const next = `**Pull request de reprise** : ${pr}\nFusionnez-la sur GitHub : le projet apparaîtra alors dans ADA.`;

  if (analysis.stories.length) {
    await stories.commentAsAssistant(token, repository, number, 'Analyse de la reprise', breakdownText(`${analysis.text}\n\n${next}`, analysis.stories));
    await stories.changeStatus(token, repository, number, 'breakdown');
    await tools.record(repository, number, 'Terminé : fusionnez la reprise, puis choisissez les améliorations');
    return;
  }
  await stories.commentAsAssistant(token, repository, number, 'Analyse de la reprise', `${analysis.text}\n\nAucune amélioration à proposer.\n\n${next}`);
  await gh.issues.update({ owner, repo, issue_number: number, state: 'closed', state_reason: 'completed' });
  await tools.record(repository, number, 'Terminé : fusionnez la reprise');
}
