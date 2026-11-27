import type { GithubService } from '../github/github.service.js';
import type { RepositoryTarget } from '../projects/repository.js';
import { FREE_LABEL } from './story.js';

/** Creates the label in the repository if it does not exist: GitHub refuses to set an unknown label. */
export async function ensureLabel(gh: ReturnType<GithubService['client']>, target: RepositoryTarget, name: string): Promise<void> {
  try {
    await gh.issues.getLabel({ ...target, name: name });
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
    await gh.issues.createLabel({
      ...target,
      name: name,
      color: name === FREE_LABEL ? '6a6af4' : '0063cb',
      description: name === FREE_LABEL ? 'Demande libre du PO (mode sauvage, hors story)' : 'Statut géré par ADA',
    });
  }
}
