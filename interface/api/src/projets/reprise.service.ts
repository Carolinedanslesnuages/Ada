import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { CONFIG, type Config } from '../config.js';
import { decrireErreurGithub, traduireErreurGithub } from '../github/erreurs.js';
import { GithubService } from '../github/github.service.js';
import { identifiantProjet, lireIdentifiant, verifierAcces } from './depot.js';
import { ProjetsService, TOPIC_REPRISE, type DepotGithub } from './projets.service.js';
import { prReprise } from './reprise.js';
import { StoriesService } from '../stories/stories.service.js';
import { AgentService } from '../agent/agent.service.js';

export interface DepotAReprendre {
  id: string;
  nom: string;
  proprietaire: string;
  compte: 'organisation' | 'personnel';
  description: string | null;
  url: string;
  /** PR de reprise déjà ouverte, en attente de validation par le PO. */
  repriseEnCours: string | null;
  /** L'assistant analyse le projet ; la PR de reprise s'ouvrira à la fin. */
  analyseEnCours: boolean;
}

export interface ResultatReprise {
  /** Demande d'analyse (issue du projet), où l'assistant publie son bilan et ses améliorations. */
  analyse: string | null;
  /** PR de reprise, si elle était déjà ouverte. */
  pullRequest: string | null;
}

/** Demande enregistrée dans le projet, au nom du PO, et suivie par l'assistant (ADR-0009). */
export function texteDemandeAnalyse(stack: string | null, dsfr: boolean): string {
  return [
    'Analyser ce projet comme s’il avait été créé avec ADA, et proposer les améliorations pour qu’il en suive les règles (harnais et skills d’ADA).',
    stack ? `Stack la plus proche : ${stack}.` : 'Stack : à déduire du projet.',
    dsfr ? 'Apparence : DSFR.' : 'Apparence : celle du projet, sans DSFR.',
  ].join('\n');
}

const schemaReprise = z.object({
  depot: z.string().min(1).max(141),
  /** Facultative : sans elle, l'analyse déduit comment démarrer l'aperçu. */
  modele: z.string().regex(/^[a-z0-9-]{1,60}$/).nullish(),
  /** Code existant : par défaut, ADA garde l'apparence du projet et n'introduit pas le DSFR. */
  dsfr: z.boolean().default(false),
});
const statut = (e: unknown) => (e as { status?: number }).status;

@Injectable()
export class RepriseService {
  private readonly journal = new Logger(RepriseService.name);

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
    private readonly projets: ProjetsService,
    private readonly stories: StoriesService,
    private readonly agent: AgentService,
  ) {}

  /** Dépôts de l'organisation et du compte du PO qui ne sont pas encore dans ADA. */
  async lister(jeton: string, login: string): Promise<DepotAReprendre[]> {
    const gh = this.github.client(jeton);
    try {
      const depots = (await this.projets.depotsAccessibles(gh, login)).filter(
        (d) => !d.archived && d.permissions?.push !== false && !this.projets.aLeTopic(d, this.config.TOPIC_ATELIER, 'atelier-po', 'ada-creation'),
      );
      const projets = new Set((await this.projets.lister(jeton, login)).map((projet) => projet.id));
      return Promise.all(
        depots
          .map((d) => ({ d, id: identifiantProjet(d.owner.login, d.name, this.config.GITHUB_PROPRIETAIRE) }))
          .filter(({ id }) => !projets.has(id))
          .sort((a, b) => a.d.name.localeCompare(b.d.name))
          .map(async ({ d, id }) => ({
            id,
            nom: d.name,
            proprietaire: d.owner.login,
            compte: d.owner.login.toLowerCase() === this.config.GITHUB_PROPRIETAIRE.toLowerCase() ? ('organisation' as const) : ('personnel' as const),
            description: d.description,
            url: d.html_url,
            ...(await this.etatReprise(gh, d, id)),
          })),
      );
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  private async etatReprise(gh: Octokit, depot: DepotGithub, id: string): Promise<Pick<DepotAReprendre, 'repriseEnCours' | 'analyseEnCours'>> {
    if (!this.projets.aLeTopic(depot, TOPIC_REPRISE)) return { repriseEnCours: null, analyseEnCours: false };
    const repriseEnCours = await prReprise(gh, depot.owner.login, depot.name);
    return { repriseEnCours, analyseEnCours: !repriseEnCours && (await this.agent.verrouActif(id)) !== null };
  }

  /**
   * Reprise : ADA marque le dépôt (topic provisoire, labels), enregistre la demande d'analyse
   * dans le projet au nom du PO et lance l'assistant. À la fin de son analyse, ADA ouvre la PR de
   * reprise (ada.json déduit) et l'assistant propose les améliorations. Rien n'arrive sur main
   * sans la fusion du PO. Une reprise déjà proposée renvoie sa PR.
   */
  async reprendre(jeton: string, login: string, donnees: unknown): Promise<ResultatReprise> {
    const saisie = schemaReprise.safeParse(donnees);
    if (!saisie.success) throw new BadRequestException('Choisissez le dépôt à reprendre');
    const id = saisie.data.depot.toLowerCase();
    const { owner, repo } = lireIdentifiant(id, this.config.GITHUB_PROPRIETAIRE);
    verifierAcces({ owner, repo }, login, this.config.GITHUB_PROPRIETAIRE);
    const modele = saisie.data.modele ? this.projets.modeles().modeles.find((m) => m.id === saisie.data.modele) : null;
    if (saisie.data.modele && !modele?.disponible) throw new BadRequestException('Cette stack n’est pas disponible');
    this.agent.verifierDisponible();
    const gh = this.github.client(jeton);

    let depot: DepotGithub;
    try {
      ({ data: depot } = await gh.repos.get({ owner, repo }));
    } catch (e) {
      traduireErreurGithub(e);
    }
    if (this.projets.aLeTopic(depot, this.config.TOPIC_ATELIER, 'atelier-po')) throw new ConflictException('Ce projet est déjà dans ADA');
    if (depot.archived) throw new BadRequestException('Ce dépôt est archivé : il ne peut pas être repris');
    if (depot.default_branch !== 'main') {
      throw new BadRequestException(`La branche principale de ce dépôt s’appelle « ${depot.default_branch} » : ADA travaille sur « main ». Un développeur doit la renommer avant la reprise.`);
    }
    if (await this.agent.verrouActif(id)) throw new ConflictException('L’assistant analyse déjà ce projet');

    try {
      const dejaOuverte = await prReprise(gh, owner, repo);
      if (dejaOuverte) return { analyse: null, pullRequest: dejaOuverte };

      await gh.repos
        .replaceAllTopics({ owner, repo, names: [...new Set([...(depot.topics ?? []), TOPIC_REPRISE])] })
        .catch((e: unknown) => {
          if (statut(e) === 403 || statut(e) === 404) {
            throw new ForbiddenException('Seul un administrateur de ce dépôt peut le faire reprendre par ADA.');
          }
          throw e;
        });
      await this.projets.poserLabels(gh, owner, repo);
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.journal.warn(`Reprise de ${owner}/${repo} : ${decrireErreurGithub(e)}`);
      traduireErreurGithub(e);
    }
    const demande = await this.stories.prompter(jeton, id, texteDemandeAnalyse(modele?.libelle ?? null, saisie.data.dsfr), login);
    await this.agent.analyserReprise(jeton, id, demande.numero, login, { modele: modele?.id ?? null, dsfr: saisie.data.dsfr });
    return { analyse: `https://github.com/${owner}/${repo}/issues/${demande.numero}`, pullRequest: null };
  }
}
