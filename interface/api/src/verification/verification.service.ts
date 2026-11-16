import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { AgentService } from '../agent/agent.service.js';
import { ApercuService } from '../apercu/apercu.service.js';
import { CONFIG, type Config } from '../config.js';
import { traduireErreurGithub } from '../github/erreurs.js';
import { GithubService } from '../github/github.service.js';
import { ProjetsService } from '../projets/projets.service.js';
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
    private readonly projets: ProjetsService,
  ) {}

  /** La PR de la demande, l'état de ses contrôles, et si le PO peut fusionner. */
  /** Nombre de commits de main absents de la branche (0 : la branche est à jour). */
  private async retard(gh: ReturnType<GithubService['client']>, depot: string, base: string, tete: string): Promise<number> {
    const { data } = await gh.repos.compareCommits({ owner: this.config.GITHUB_PROPRIETAIRE, repo: depot, base: tete, head: base });
    return data.ahead_by;
  }

  async verifier(jeton: string, depot: string, numero: number): Promise<Verification> {
    const numeroPr = numeroDepuisUrl((await this.agent.activite(depot, numero)).pullRequest);
    if (!numeroPr) return { pullRequest: null, controles: [], fusionnable: false, raison: 'Aucune pull request pour cette demande' };
    const gh = this.github.client(jeton);
    const owner = this.config.GITHUB_PROPRIETAIRE;
    try {
      const { data: pr } = await gh.pulls.get({ owner, repo: depot, pull_number: numeroPr });
      const { data: runs } = await gh.checks.listForRef({ owner, repo: depot, ref: pr.head.sha, per_page: 100 });
      const etat = pr.merged ? 'fusionnee' : pr.state === 'closed' ? 'fermee' : 'ouverte';
      const { controlesRequis } = await this.projets.lireConfigDepot(gh, owner, depot, pr.base.ref);
      const controles = etatControles(runs.check_runs, controlesRequis);
      return {
        pullRequest: { numero: pr.number, url: pr.html_url, etat },
        controles,
        ...peutFusionner(etat, pr.mergeable, controles, pr.title),
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
      // Branche en retard sur main : on la met à jour d'abord ; les contrôles repartent sur le code
      // réellement fusionné, et le PO valide de nouveau quand ils sont verts.
      if ((await this.retard(gh, depot, pr.base.ref, pr.head.sha)) > 0) {
        await gh.pulls.updateBranch({ owner, repo: depot, pull_number: pr.number, expected_head_sha: pr.head.sha });
        return {
          ...verification,
          fusionnable: false,
          raison:
            'Le projet a évolué depuis cette demande : elle vient d’être mise à jour et les contrôles sont relancés. Revenez valider quand ils sont verts.',
        };
      }
      await gh.pulls.merge({
        owner,
        repo: depot,
        pull_number: pr.number,
        merge_method: 'squash',
        commit_title: `${pr.title} (#${pr.number})`,
        commit_message: `Closes #${numero}`,
      });
    } catch (e) {
      traduireErreurGithub(e);
    }
    // La fusion est faite : la suite (ménage) ne doit jamais faire échouer la réponse au PO.
    await this.apresFusion(jeton, depot, numero);
    return this.verifier(jeton, depot, numero);
  }

  /**
   * « Closes #n » ferme l'issue en même temps que la fusion : on ne la ferme que si elle est
   * encore ouverte, puis on retire le statut et on remet l'aperçu sur main. Chaque étape est
   * indépendante : un échec est journalisé, sans annuler ni masquer la fusion.
   */
  private async apresFusion(jeton: string, depot: string, numero: number): Promise<void> {
    const gh = this.github.client(jeton);
    const owner = this.config.GITHUB_PROPRIETAIRE;
    const etapes: [string, () => Promise<unknown>][] = [
      [
        'fermeture de l’issue',
        async () => {
          const { data: issue } = await gh.issues.get({ owner, repo: depot, issue_number: numero });
          if (issue.state === 'open') {
            await gh.issues.update({ owner, repo: depot, issue_number: numero, state: 'closed', state_reason: 'completed' });
          }
        },
      ],
      ['retrait du statut', () => this.stories.retirerStatut(jeton, depot, numero)],
      ['retour de l’aperçu sur main', () => this.apercu.revenirSurMain(jeton, depot)],
    ];
    for (const [etape, action] of etapes) {
      try {
        await action();
      } catch (e) {
        this.log.warn(`Après fusion de ${depot}#${numero}, ${etape} : ${(e as Error).message.split('\n')[0]}`);
      }
    }
  }
}
