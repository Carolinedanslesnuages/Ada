import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { traduireErreurGithub } from '../github/erreurs.js';
import {
  formaterPrompt,
  LABEL_BUG,
  LABEL_LIBRE,
  LABEL_STORY,
  lireBug,
  lirePrompt,
  lireStory,
  ajouterDecoupage,
  cocherEnfant,
  formaterStory,
  lireParent,
  validerStoriesAPublier,
  STATUTS,
  STATUTS_ACTIFS,
  statutDepuis,
  titrePrompt,
  typeDepuis,
  verifierPrete,
  verifierPrompt,
  type ContenuBug,
  type ContenuStory,
  type Statut,
  type TypeDemande,
} from './story.js';
import { lireIdentifiant, type CibleDepot } from '../projets/depot.js';

/** Marque les commentaires écrits par l'assistant, pour reconstituer les échanges. */
export const MARQUEUR_ASSISTANT = '<!-- atelier-po:assistant -->';
/** Marque le commentaire de lancement : les échanges utiles à l'agent commencent après. */
/** Début du commentaire de lancement (« depuis ADA », ou « depuis l’atelier PO » avant le renommage). */
export const MARQUEUR_LANCEMENT = '▶️ Lancée depuis ADA';
export const DEBUT_LANCEMENT = '▶️ Lancée depuis ';

export interface ResumeStory {
  numero: number;
  type: TypeDemande;
  titre: string;
  statut: Statut;
  creeeLe: string;
  /** Date de fermeture de l'issue (livraison), null tant qu'elle est ouverte. */
  fermeeLe: string | null;
  url: string;
  /** Prête à être lancée (complète, assez petite) ; sinon la raison, à corriger sur GitHub. */
  prete: boolean;
  raison: string | null;
}

export interface Message {
  id: number;
  auteur: string;
  avatar: string | null;
  texte: string;
  le: string;
}

/** Développeur qui peut être assigné à une demande (accès au dépôt du projet). */
export interface Personne {
  login: string;
  avatar: string | null;
}

export interface DetailStory extends ResumeStory {
  /** Développeurs assignés sur GitHub (déblocage d'une demande « Besoin d'un développeur »). */
  assignes: Personne[];
  contenu: ContenuStory | null;
  contenuBug: ContenuBug | null;
  /** Mode sauvage : le prompt du PO. */
  contenuLibre: string | null;
  texteBrut: string;
  messages: Message[];
}

type Issue = {
  number: number;
  title: string;
  state: string;
  created_at: string;
  closed_at?: string | null;
  html_url: string;
  body?: string | null;
  pull_request?: unknown;
  labels: (string | { name?: string })[];
};

const nomsLabels = (labels: Issue['labels']) => labels.map((l) => (typeof l === 'string' ? l : (l.name ?? '')));

const resumer = (i: Issue): ResumeStory => {
  const labels = nomsLabels(i.labels);
  const corps = i.body ?? '';
  const type = typeDepuis(labels, corps) ?? 'story';
  const verification = verifierPrete(type, lireStory(corps), lireBug(corps), lirePrompt(corps));
  return {
    numero: i.number,
    type,
    titre: i.title,
    statut: statutDepuis(i.state === 'closed' ? 'closed' : 'open', labels),
    creeeLe: i.created_at,
    fermeeLe: i.closed_at ?? null,
    url: i.html_url,
    prete: verification.prete,
    raison: verification.prete ? null : verification.raison,
  };
};

@Injectable()
export class StoriesService {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
  ) {}

  /** Compte et dépôt GitHub d'un projet d'ADA (voir projets/depot.ts). */
  private cible(depot: string): CibleDepot {
    return lireIdentifiant(depot, this.config.GITHUB_PROPRIETAIRE);
  }

  /**
   * Stories et problèmes écrits dans GitHub, du plus récent au plus ancien : issues portant le
   * label, ou rédigées avec le formulaire même si le label manquait dans le dépôt.
   */
  async lister(jeton: string, depot: string): Promise<ResumeStory[]> {
    const gh = this.github.client(jeton);
    try {
      const issues = (await gh.paginate(gh.issues.listForRepo, {
        ...this.cible(depot),
        state: 'all',
        per_page: 100,
      })) as Issue[];
      return issues
        .filter((i) => !i.pull_request && typeDepuis(nomsLabels(i.labels), i.body ?? '') !== null)
        .sort((a, b) => b.number - a.number)
        .map(resumer);
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  async detail(jeton: string, depot: string, numero: number): Promise<DetailStory> {
    const gh = this.github.client(jeton);
    try {
      const [{ data: issue }, { data: commentaires }] = await Promise.all([
        gh.issues.get({ ...this.cible(depot), issue_number: numero }),
        gh.issues.listComments({ ...this.cible(depot), issue_number: numero, per_page: 100 }),
      ]);
      const corps = issue.body ?? '';
      return {
        ...resumer(issue as Issue),
        contenu: lireStory(corps),
        contenuBug: lireBug(corps),
        contenuLibre: lirePrompt(corps),
        texteBrut: corps,
        assignes: (issue.assignees ?? []).map((personne) => ({ login: personne.login, avatar: personne.avatar_url ?? null })),
        messages: commentaires.map((c) => ({
          id: c.id,
          auteur: c.user?.login ?? 'inconnu',
          avatar: c.user?.avatar_url ?? null,
          texte: c.body ?? '',
          le: c.created_at,
        })),
      };
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  /** Personnes qui peuvent être assignées aux issues du dépôt (accès au projet). */
  async developpeurs(jeton: string, depot: string): Promise<Personne[]> {
    const gh = this.github.client(jeton);
    try {
      const personnes = await gh.paginate(gh.issues.listAssignees, { ...this.cible(depot), per_page: 100 });
      return personnes
        .map((personne) => ({ login: personne.login, avatar: personne.avatar_url ?? null }))
        .sort((premiere, seconde) => premiere.login.localeCompare(seconde.login));
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  /**
   * Assigne un développeur à une demande bloquée (« Besoin d'un développeur »), en remplaçant
   * l'assignation éventuelle ; `null` retire l'assignation (possible à tout moment). ADA ne
   * prévient pas le développeur : il l'a été par ailleurs.
   */
  async assigner(jeton: string, depot: string, numero: number, login: unknown): Promise<DetailStory> {
    if (login !== null && (typeof login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(login))) {
      throw new BadRequestException('Choisissez un développeur dans la liste');
    }
    const gh = this.github.client(jeton);
    const { data: issue } = await gh.issues.get({ ...this.cible(depot), issue_number: numero }).catch((e: unknown) => traduireErreurGithub(e));
    if (login !== null) {
      if (resumer(issue as Issue).statut !== 'besoin-dev') {
        throw new BadRequestException('On assigne un développeur seulement à une demande bloquée (« Besoin d’un développeur »)');
      }
      if (!(await this.developpeurs(jeton, depot)).some((personne) => personne.login === login)) {
        throw new BadRequestException(`${login} n’a pas accès au projet : il ne peut pas être assigné`);
      }
    }
    try {
      const actuels = (issue.assignees ?? []).map((personne) => personne.login).filter((actuel) => actuel !== login);
      if (actuels.length) await gh.issues.removeAssignees({ ...this.cible(depot), issue_number: numero, assignees: actuels });
      if (login !== null) await gh.issues.addAssignees({ ...this.cible(depot), issue_number: numero, assignees: [login] });
    } catch (e) {
      traduireErreurGithub(e);
    }
    return this.detail(jeton, depot, numero);
  }

  /**
   * Mode sauvage : le prompt devient une issue « mode-libre » (trace dans GitHub), lancée tout
   * de suite. Mêmes règles qu'une story : une seule demande active par projet.
   */
  async prompter(jeton: string, depot: string, texte: unknown, login: string): Promise<ResumeStory> {
    const verification = verifierPrompt(texte);
    if (!verification.ok) throw new BadRequestException({ erreurs: { texte: verification.erreur } });
    const active = (await this.lister(jeton, depot)).find((s) => STATUTS_ACTIFS.includes(s.statut));
    if (active) {
      throw new ConflictException(`La demande #${active.numero} « ${active.titre} » est en cours : une seule demande à la fois`);
    }
    const gh = this.github.client(jeton);
    try {
      await this.assurerLabel(jeton, depot, LABEL_LIBRE);
      await this.assurerLabel(jeton, depot, STATUTS['en-cours']);
      const { data } = await gh.issues.create({
        ...this.cible(depot),
        title: titrePrompt(verification.texte),
        body: formaterPrompt(verification.texte),
        labels: [LABEL_LIBRE, STATUTS['en-cours']],
      });
      await gh.issues.createComment({
        ...this.cible(depot),
        issue_number: data.number,
        body: `${MARQUEUR_LANCEMENT} par ${login} (mode sauvage).`,
      });
      return resumer(data as Issue);
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  /** Lance une demande : une seule à la fois par projet, et seulement si elle est prête. */
  async lancer(jeton: string, depot: string, numero: number, login: string): Promise<ResumeStory> {
    const toutes = await this.lister(jeton, depot);
    const cible = toutes.find((s) => s.numero === numero);
    if (!cible) throw new BadRequestException(`La demande #${numero} n’est ni une story ni un problème de l’atelier`);
    if (cible.statut !== 'nouvelle') throw new ConflictException(`La demande #${numero} est déjà lancée ou terminée`);
    if (!cible.prete) throw new BadRequestException(`La demande #${numero} n’est pas prête : ${cible.raison}`);
    const active = toutes.find((s) => STATUTS_ACTIFS.includes(s.statut));
    if (active) {
      throw new ConflictException(
        `La demande #${active.numero} « ${active.titre} » est en cours : une seule demande à la fois`,
      );
    }
    const gh = this.github.client(jeton);
    try {
      const labelType = cible.type === 'bug' ? LABEL_BUG : cible.type === 'libre' ? LABEL_LIBRE : LABEL_STORY;
      await this.assurerLabel(jeton, depot, labelType);
      await this.assurerLabel(jeton, depot, STATUTS['en-cours']);
      await gh.issues.addLabels({
        ...this.cible(depot),
        issue_number: numero,
        labels: [labelType, STATUTS['en-cours']],
      });
      await gh.issues.createComment({
        ...this.cible(depot),
        issue_number: numero,
        body: `${MARQUEUR_LANCEMENT} par ${login}.`,
      });
    } catch (e) {
      traduireErreurGithub(e);
    }
    return { ...cible, statut: 'en-cours' };
  }

  /** Remplace le statut de l'issue (un seul label story:* à la fois). */
  async changerStatut(jeton: string, depot: string, numero: number, statut: keyof typeof STATUTS): Promise<void> {
    const gh = this.github.client(jeton);
    try {
      const { data } = await gh.issues.get({ ...this.cible(depot), issue_number: numero });
      const autres = nomsLabels((data as Issue).labels).filter((l) => !l.startsWith('story:'));
      await this.assurerLabel(jeton, depot, STATUTS[statut]);
      await gh.issues.setLabels({ ...this.cible(depot), issue_number: numero, labels: [...autres, STATUTS[statut]] });
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  /** Retire tout label de statut (demande livrée : l'issue fermée suffit). */
  async retirerStatut(jeton: string, depot: string, numero: number): Promise<void> {
    const gh = this.github.client(jeton);
    try {
      const { data } = await gh.issues.get({ ...this.cible(depot), issue_number: numero });
      const garder = nomsLabels((data as Issue).labels).filter((l) => !l.startsWith('story:'));
      await gh.issues.setLabels({ ...this.cible(depot), issue_number: numero, labels: garder });
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  /**
   * Découpage validé par le PO (#36) : ADA publie, à son nom, les stories qu'il a cochées — telles
   * qu'il les a relues et éventuellement corrigées (champs préremplis par l'assistant) — et la
   * demande d'origine devient leur parent (liste à cocher, fermée quand toutes sont livrées).
   */
  async creerDecoupage(jeton: string, depot: string, numero: number, saisies: unknown, login: string): Promise<ResumeStory[]> {
    const parent = await this.detail(jeton, depot, numero);
    if (parent.statut !== 'decoupage') throw new ConflictException('Aucun découpage n’attend votre choix sur cette demande');
    const stories = validerStoriesAPublier(saisies);
    const gh = this.github.client(jeton);
    const creees: ResumeStory[] = [];
    try {
      await this.assurerLabel(jeton, depot, LABEL_STORY);
      for (const story of stories) {
        const { data } = await gh.issues.create({
          ...this.cible(depot),
          title: story.titre,
          body: formaterStory(story, numero),
          labels: [LABEL_STORY],
        });
        creees.push(resumer(data as Issue));
      }
      const { data: issueParent } = await gh.issues.get({ ...this.cible(depot), issue_number: numero });
      await gh.issues.update({
        ...this.cible(depot),
        issue_number: numero,
        body: ajouterDecoupage(issueParent.body ?? '', creees.map((story) => ({ numero: story.numero, titre: story.titre }))),
      });
      await gh.issues.createComment({
        ...this.cible(depot),
        issue_number: numero,
        body: `✂️ Découpage validé par ${login} : ${creees.map((story) => `#${story.numero}`).join(', ')} créées depuis ADA.`,
      });
      await this.changerStatut(jeton, depot, numero, 'parent');
    } catch (e) {
      traduireErreurGithub(e);
    }
    return creees;
  }

  /** Story livrée : si elle vient d'un découpage, la cocher dans sa demande parent, fermée quand tout est livré. */
  async signalerLivraisonAuParent(jeton: string, depot: string, numero: number): Promise<void> {
    const gh = this.github.client(jeton);
    try {
      const { data: enfant } = await gh.issues.get({ ...this.cible(depot), issue_number: numero });
      const numeroParent = lireParent(enfant.body ?? '');
      if (!numeroParent) return;
      const { data: parent } = await gh.issues.get({ ...this.cible(depot), issue_number: numeroParent });
      const { corps, toutesLivrees } = cocherEnfant(parent.body ?? '', numero);
      if (corps !== parent.body) await gh.issues.update({ ...this.cible(depot), issue_number: numeroParent, body: corps });
      if (toutesLivrees && parent.state === 'open') {
        await gh.issues.createComment({ ...this.cible(depot), issue_number: numeroParent, body: '✅ Toutes les stories du découpage sont livrées.' });
        await gh.issues.update({ ...this.cible(depot), issue_number: numeroParent, state: 'closed', state_reason: 'completed' });
        await this.retirerStatut(jeton, depot, numeroParent);
      }
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  /** Message de l'assistant dans l'issue, reconnaissable par son marqueur. */
  async commenterAssistant(jeton: string, depot: string, numero: number, titre: string, texte: string): Promise<void> {
    try {
      await this.github.client(jeton).issues.createComment({
        ...this.cible(depot),
        issue_number: numero,
        body: `${MARQUEUR_ASSISTANT}\n🤖 **${titre}**\n\n${texte}`,
      });
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  async repondre(jeton: string, depot: string, numero: number, texte: string): Promise<Message> {
    const propre = (texte ?? '').trim();
    if (!propre) throw new BadRequestException({ erreurs: { texte: 'Le message est vide' } });
    try {
      const { data: c } = await this.github.client(jeton).issues.createComment({
        ...this.cible(depot),
        issue_number: numero,
        body: propre,
      });
      return { id: c.id, auteur: c.user?.login ?? 'inconnu', avatar: c.user?.avatar_url ?? null, texte: c.body ?? '', le: c.created_at };
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  private async assurerLabel(jeton: string, depot: string, nom: string): Promise<void> {
    const gh = this.github.client(jeton);
    try {
      await gh.issues.getLabel({ ...this.cible(depot), name: nom });
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
      await gh.issues.createLabel({
        ...this.cible(depot),
        name: nom,
        color: nom === LABEL_LIBRE ? '6a6af4' : '0063cb',
        description: nom === LABEL_LIBRE ? 'Demande libre du PO (mode sauvage, hors story)' : 'Statut géré par ADA',
      });
    }
  }
}
