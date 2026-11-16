import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { traduireErreurGithub } from '../github/erreurs.js';
import {
  LABEL_BUG,
  LABEL_STORY,
  lireBug,
  lireStory,
  STATUTS,
  STATUTS_ACTIFS,
  statutDepuis,
  typeDepuis,
  verifierPrete,
  type ContenuBug,
  type ContenuStory,
  type Statut,
  type TypeDemande,
} from './story.js';

export interface ResumeStory {
  numero: number;
  type: TypeDemande;
  titre: string;
  statut: Statut;
  creeeLe: string;
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

export interface DetailStory extends ResumeStory {
  contenu: ContenuStory | null;
  contenuBug: ContenuBug | null;
  texteBrut: string;
  messages: Message[];
}

type Issue = {
  number: number;
  title: string;
  state: string;
  created_at: string;
  html_url: string;
  body?: string | null;
  pull_request?: unknown;
  labels: (string | { name?: string })[];
};

const nomsLabels = (labels: Issue['labels']) => labels.map((l) => (typeof l === 'string' ? l : (l.name ?? '')));

const resumer = (i: Issue): ResumeStory => {
  const labels = nomsLabels(i.labels);
  const type = typeDepuis(labels);
  const corps = i.body ?? '';
  const verification = verifierPrete(type, lireStory(corps), lireBug(corps));
  return {
    numero: i.number,
    type,
    titre: i.title,
    statut: statutDepuis(i.state === 'closed' ? 'closed' : 'open', labels),
    creeeLe: i.created_at,
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

  private get owner() {
    return this.config.GITHUB_PROPRIETAIRE;
  }

  /** Stories et problèmes écrits dans GitHub, du plus récent au plus ancien. */
  async lister(jeton: string, depot: string): Promise<ResumeStory[]> {
    const gh = this.github.client(jeton);
    const parLabel = (labels: string) =>
      gh.issues.listForRepo({ owner: this.owner, repo: depot, labels, state: 'all', per_page: 100 });
    try {
      const [stories, bugs] = await Promise.all([parLabel(LABEL_STORY), parLabel(LABEL_BUG)]);
      const parNumero = new Map<number, Issue>();
      for (const i of [...stories.data, ...bugs.data] as Issue[]) {
        if (!i.pull_request) parNumero.set(i.number, i);
      }
      return [...parNumero.values()].sort((a, b) => b.number - a.number).map(resumer);
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  async detail(jeton: string, depot: string, numero: number): Promise<DetailStory> {
    const gh = this.github.client(jeton);
    try {
      const [{ data: issue }, { data: commentaires }] = await Promise.all([
        gh.issues.get({ owner: this.owner, repo: depot, issue_number: numero }),
        gh.issues.listComments({ owner: this.owner, repo: depot, issue_number: numero, per_page: 100 }),
      ]);
      const corps = issue.body ?? '';
      return {
        ...resumer(issue as Issue),
        contenu: lireStory(corps),
        contenuBug: lireBug(corps),
        texteBrut: corps,
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
      await this.assurerLabel(jeton, depot, STATUTS['en-cours']);
      await gh.issues.addLabels({ owner: this.owner, repo: depot, issue_number: numero, labels: [STATUTS['en-cours']] });
      await gh.issues.createComment({
        owner: this.owner,
        repo: depot,
        issue_number: numero,
        body: `▶️ Lancée depuis l’atelier PO par ${login}.`,
      });
    } catch (e) {
      traduireErreurGithub(e);
    }
    return { ...cible, statut: 'en-cours' };
  }

  async repondre(jeton: string, depot: string, numero: number, texte: string): Promise<Message> {
    const propre = (texte ?? '').trim();
    if (!propre) throw new BadRequestException({ erreurs: { texte: 'Le message est vide' } });
    try {
      const { data: c } = await this.github.client(jeton).issues.createComment({
        owner: this.owner,
        repo: depot,
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
      await gh.issues.getLabel({ owner: this.owner, repo: depot, name: nom });
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
      await gh.issues.createLabel({
        owner: this.owner,
        repo: depot,
        name: nom,
        color: '0063cb',
        description: 'Statut géré par l’atelier PO',
      });
    }
  }
}
