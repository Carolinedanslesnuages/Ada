import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { traduireErreurGithub } from '../github/erreurs.js';
import {
  formaterCorps,
  formaterCorpsBug,
  LABEL_BUG,
  LABEL_STORY,
  lireCorps,
  lireCorpsBug,
  statutDepuis,
  typeDepuis,
  validerBug,
  validerStory,
  type NouveauBug,
  type NouvelleStory,
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
}

export interface Message {
  id: number;
  auteur: string;
  avatar: string | null;
  texte: string;
  le: string;
}

export interface DetailStory extends ResumeStory {
  contenu: Omit<NouvelleStory, 'titre'> | null;
  contenuBug: Omit<NouveauBug, 'titre'> | null;
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

const nomsLabels = (labels: Issue['labels']) =>
  labels.map((l) => (typeof l === 'string' ? l : (l.name ?? '')));

const resumer = (i: Issue): ResumeStory => ({
  numero: i.number,
  type: typeDepuis(nomsLabels(i.labels)),
  titre: i.title,
  statut: statutDepuis(i.state === 'closed' ? 'closed' : 'open', nomsLabels(i.labels)),
  creeeLe: i.created_at,
  url: i.html_url,
});

@Injectable()
export class StoriesService {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly github: GithubService,
  ) {}

  private get owner() {
    return this.config.GITHUB_PROPRIETAIRE;
  }

  /** Stories et problèmes signalés, du plus récent au plus ancien. */
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
      return {
        ...resumer(issue as Issue),
        contenu: lireCorps(issue.body ?? ''),
        contenuBug: lireCorpsBug(issue.body ?? ''),
        texteBrut: issue.body ?? '',
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

  async creer(jeton: string, depot: string, donnees: unknown): Promise<ResumeStory> {
    const validation = validerStory(donnees);
    if (!validation.ok) throw new BadRequestException({ erreurs: validation.erreurs });
    const gh = this.github.client(jeton);
    try {
      await this.assurerLabel(jeton, depot, LABEL_STORY);
      const { data } = await gh.issues.create({
        owner: this.owner,
        repo: depot,
        title: validation.story.titre,
        body: formaterCorps(validation.story),
        labels: [LABEL_STORY],
      });
      return resumer(data as Issue);
    } catch (e) {
      traduireErreurGithub(e);
    }
  }

  async signaler(jeton: string, depot: string, donnees: unknown): Promise<ResumeStory> {
    const validation = validerBug(donnees);
    if (!validation.ok) throw new BadRequestException({ erreurs: validation.erreurs });
    const gh = this.github.client(jeton);
    try {
      await this.assurerLabel(jeton, depot, LABEL_BUG);
      const { data } = await gh.issues.create({
        owner: this.owner,
        repo: depot,
        title: validation.bug.titre,
        body: formaterCorpsBug(validation.bug),
        labels: [LABEL_BUG],
      });
      return resumer(data as Issue);
    } catch (e) {
      traduireErreurGithub(e);
    }
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
        color: nom === LABEL_BUG ? 'ce0500' : '000091',
        description: nom === LABEL_BUG ? 'Problème signalé depuis l’atelier PO' : 'Story créée depuis l’atelier PO',
      });
    }
  }
}
