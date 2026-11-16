/** Stories et problèmes : écrits par le PO dans GitHub, lus et lancés depuis l'atelier. */
export const CRITERES_MAX = 4

export type Statut =
  | 'nouvelle'
  | 'en-cours'
  | 'questions'
  | 'plan-a-valider'
  | 'en-verification'
  | 'besoin-dev'
  | 'livree'

export const STATUTS_ACTIFS: Statut[] = [
  'en-cours',
  'questions',
  'plan-a-valider',
  'en-verification',
  'besoin-dev',
]

export const LIBELLES_STATUT: Record<
  Statut,
  { libelle: string; type: 'info' | 'new' | 'warning' | 'success' | 'error' }
> = {
  nouvelle: { libelle: 'À lancer', type: 'new' },
  'en-cours': { libelle: 'En cours', type: 'info' },
  questions: { libelle: 'Questions', type: 'warning' },
  'plan-a-valider': { libelle: 'Plan à valider', type: 'warning' },
  'en-verification': { libelle: 'À vérifier', type: 'info' },
  'besoin-dev': { libelle: 'Besoin d’un développeur', type: 'error' },
  livree: { libelle: 'Livrée', type: 'success' },
}

export type TypeDemande = 'story' | 'bug' | 'libre'

export interface ResumeStory {
  numero: number
  type: TypeDemande
  titre: string
  statut: Statut
  creeeLe: string
  /** Date de livraison (issue fermée), null sinon. */
  fermeeLe: string | null
  url: string
  prete: boolean
  raison: string | null
}

export interface ContenuStory {
  role: string
  besoin: string
  benefice: string
  criteres: string[]
}

export interface ContenuBug {
  constate: string
  attendu: string
  etapes: string
  ecran: string
}

export interface Message {
  id: number
  auteur: string
  avatar: string | null
  texte: string
  le: string
}

/** Développeur qui peut être assigné (accès au dépôt du projet). */
export interface Personne {
  login: string
  avatar: string | null
}

export interface DetailStory extends ResumeStory {
  /** Développeurs assignés sur GitHub. */
  assignes: Personne[]
  contenu: ContenuStory | null
  contenuBug: ContenuBug | null
  contenuLibre: string | null
  texteBrut: string
  messages: Message[]
}

/** Adresse du formulaire GitHub pour écrire une story ou signaler un problème. */
export function lienNouvelleIssue(urlDepot: string, modele: 'user-story.yml' | 'bug.yml'): string {
  return `${urlDepot}/issues/new?template=${modele}`
}

/** Ce que fait l'assistant sur une demande (journal lisible par le PO). */
export interface Activite {
  phase: 'analyse' | 'realisation' | null
  enCours: boolean
  debut: string | null
  journal: { le: string; texte: string }[]
  erreur: string | null
  pullRequest: string | null
}

export const MARQUEUR_ASSISTANT = '<!-- atelier-po:assistant -->'

/** Message affiché au PO : les messages de l'assistant sont signés « Assistant », sans marqueur. */
export function presenterMessage(message: Message): { auteur: string; texte: string; assistant: boolean } {
  const assistant = message.texte.startsWith(MARQUEUR_ASSISTANT)
  return {
    auteur: assistant ? 'Assistant' : message.auteur,
    texte: assistant ? message.texte.replace(MARQUEUR_ASSISTANT, '').trim() : message.texte,
    assistant,
  }
}

export interface Controle {
  nom: string
  etat: 'en-attente' | 'en-cours' | 'reussi' | 'echec'
  lien: string | null
}

/** Vérification d'une demande réalisée : PR, contrôles de la CI, fusion possible ou non. */
export interface Verification {
  pullRequest: { numero: number; url: string; etat: 'ouverte' | 'fusionnee' | 'fermee' } | null
  controles: Controle[]
  fusionnable: boolean
  raison: string | null
}

export const LIBELLES_CONTROLE: Record<Controle['etat'], string> = {
  'en-attente': 'en attente',
  'en-cours': 'en cours',
  reussi: 'réussi',
  echec: 'échoué',
}

export const PROMPT_MIN = 10
export const PROMPT_MAX = 1000
