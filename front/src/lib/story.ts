/** Règles partagées avec l'API (api/src/stories/story.ts). */
export const CRITERES_MAX = 4

export type Statut =
  | 'nouvelle'
  | 'questions'
  | 'plan-a-valider'
  | 'en-cours'
  | 'en-verification'
  | 'besoin-dev'
  | 'livree'

export const LIBELLES_STATUT: Record<
  Statut,
  { libelle: string; type: 'info' | 'new' | 'warning' | 'success' | 'error' }
> = {
  nouvelle: { libelle: 'Nouvelle', type: 'new' },
  questions: { libelle: 'Questions', type: 'warning' },
  'plan-a-valider': { libelle: 'Plan à valider', type: 'warning' },
  'en-cours': { libelle: 'En cours', type: 'info' },
  'en-verification': { libelle: 'À vérifier', type: 'info' },
  'besoin-dev': { libelle: 'Besoin d’un développeur', type: 'error' },
  livree: { libelle: 'Livrée', type: 'success' },
}

export interface NouvelleStory {
  titre: string
  role: string
  besoin: string
  benefice: string
  criteres: string[]
}

export type TypeDemande = 'story' | 'bug'

export interface ResumeStory {
  numero: number
  type: TypeDemande
  titre: string
  statut: Statut
  creeeLe: string
  url: string
}

export interface Message {
  id: number
  auteur: string
  avatar: string | null
  texte: string
  le: string
}

export interface DetailStory extends ResumeStory {
  contenu: Omit<NouvelleStory, 'titre'> | null
  contenuBug: Omit<NouveauBug, 'titre'> | null
  texteBrut: string
  messages: Message[]
}

export type ErreursStory = Partial<Record<keyof NouvelleStory, string>>

/** Validation immédiate dans le formulaire ; l'API revalide de son côté. */
export function verifierStory(story: NouvelleStory): ErreursStory {
  const erreurs: ErreursStory = {}
  if (story.titre.trim().length < 5)
    erreurs.titre = 'Donnez un titre court à la story (5 caractères minimum)'
  if (story.role.trim().length < 3) erreurs.role = 'Indiquez qui a ce besoin (« En tant que… »)'
  if (story.besoin.trim().length < 5)
    erreurs.besoin = 'Décrivez ce que la personne veut faire (« je veux… »)'
  if (story.benefice.trim().length < 5)
    erreurs.benefice = 'Indiquez à quoi ça lui sert (« afin de… »)'
  const criteres = story.criteres.map((c) => c.trim()).filter(Boolean)
  if (criteres.length === 0) erreurs.criteres = 'Ajoutez au moins un critère d’acceptation'
  if (criteres.length > CRITERES_MAX)
    erreurs.criteres = `${CRITERES_MAX} critères au maximum : au-delà, découpez en plusieurs stories`
  return erreurs
}

export interface NouveauBug {
  titre: string
  constate: string
  attendu: string
  etapes: string
  ecran: string
}

export type ErreursBug = Partial<Record<keyof NouveauBug, string>>

export function verifierBug(bug: NouveauBug): ErreursBug {
  const erreurs: ErreursBug = {}
  if (bug.titre.trim().length < 5)
    erreurs.titre = 'Donnez un titre court au problème (5 caractères minimum)'
  if (bug.constate.trim().length < 5) erreurs.constate = 'Décrivez ce qui se passe'
  if (bug.attendu.trim().length < 5) erreurs.attendu = 'Décrivez ce qui devrait se passer'
  if (bug.etapes.trim().length < 5) erreurs.etapes = 'Indiquez comment reproduire le problème'
  return erreurs
}
