import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { AgentService } from '../agent/agent.service.js';
import { ApercuService } from '../apercu/apercu.service.js';
import { CONFIG, type Config } from '../config.js';
import { traduireErreurGithub } from '../github/erreurs.js';
import { GithubService } from '../github/github.service.js';
import { StoriesService } from '../stories/stories.service.js';
import { etatControles, numeroDepuisUrl, peutFusionner, type Verification } from './verification.js';

@Injectable()
export class VerificationService {
  private readonly log = new Logger(VerificationService.name);

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly agent: AgentService,
    private readonly stories: StoriesService,
    private readonly apercu: ApercuService,
  ) {}

  /** La PR de la demande, l'état de ses contrôles, et si le PO peut fusionner. */
  async verifier(jeton: string, depot: string, numero: number): Promise<Verification> {
    const numeroPr = numeroDepuisUrl((await this.agent.activite(depot, numero)).pullRequest);
    if (!numeroPr) return { pullRequest: null, controles: [], fusionnable: false, raison: 'Aucune pull request pour cette demande' };
    const gh = this.github.client(jeton);
    const owner = this.config.GITHUB_PROPRIETAIRE;
    try {
      const { data: pr } = await gh.pulls.get({ owner, repo: depot, pull_number: numeroPr });
      const { data: runs } = await gh.checks.listForRef({ owner, repo: depot, ref: pr.head.sha, per_page: 100 });
      const etat = pr.merged ? 'fusionnee' : pr.state === 'closed' ? 'fermee' : 'ouverte';
      const controles = etatControles(runs.check_runs);
      return {
        pullRequest: { numero: pr.number, url: pr.html_url, etat },
        controles,
        ...peutFusionner(etat, pr.mergeable, controles),
      };
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  /**
   * Fusion par le PO (en son nom), seulement si tout est vert. Squash : un seul commit
   * Conventional Commits sur main (release-please), qui ferme l'issue.
   */
  async fusionner(jeton: string, depot: string, numero: number): Promise<Verification> {
    const verification = await this.verifier(jeton, depot, numero);
    if (!verification.fusionnable || !verification.pullRequest) {
      throw new ConflictException(verification.raison ?? 'Fusion impossible pour l’instant');
    }
    const gh = this.github.client(jeton);
    const owner = this.config.GITHUB_PROPRIETAIRE;
    try {
      const { data: pr } = await gh.pulls.get({ owner, repo: depot, pull_number: verification.pullRequest.numero });
      await gh.pulls.merge({
        owner,
        repo: depot,
        pull_number: pr.number,
        merge_method: 'squash',
        commit_title: `${pr.title} (#${pr.number})`,
        commit_message: `Closes #${numero}`,
      });
      await gh.issues.update({ owner, repo: depot, issue_number: numero, state: 'closed', state_reason: 'completed' });
    } catch (e) {
      traduireErreurGithub(e);
    }
    await this.stories.retirerStatut(jeton, depot, numero);
    try {
      await this.apercu.revenirSurMain(jeton, depot);
    } catch (e) {
      // La fusion est faite : un aperçu pas encore à jour n'est pas bloquant (il le sera au prochain démarrage).
      this.log.warn(`Aperçu de ${depot} non remis sur main : ${(e as Error).message.split('\n')[0]}`);
    }
    return this.verifier(jeton, depot, numero);
  }
}
