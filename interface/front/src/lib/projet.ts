/** Règles partagées avec l'API (api/src/projets/projet.ts). */
/** Identifiant d'un type de projet (liste fournie par l'API : api/src/projets/modeles.ts). */
export type TypeProjet = string

export interface FamilleDeProjet {
  id: string
  libelle: string
}

export interface TypeDeProjet {
  id: TypeProjet
  famille: string
  libelle: string
  description: string
}

export interface Modele {
  id: string
  type: TypeProjet
  libelle: string
  pourQuoi: string
  /** Modèle livré dans le catalogue d'ADA : on peut créer ce type de projet. */
  disponible: boolean
}

export interface NouveauProjet {
  nom: string
  objectif: string
  modele: string
  /** Facultative : phrase courte sous le nom du service dans l'en-tête DSFR. */
  baseline: string
}

export type ErreursProjet = Partial<Record<keyof NouveauProjet, string>>

export interface Reglage {
  etat: 'fait' | 'a-faire'
  lien: string
}

export interface ResultatCreation {
  projet: { nom: string; description: string | null; prive: boolean; url: string; misAJourLe: string | null }
  reglages: { versionsAutomatiques: Reglage; protectionMain: Reglage }
}

export function normaliserNom(nom: string): string {
  return nom.replace(/'/g, '’').replace(/\s+/g, ' ').trim()
}

export function slugifier(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

export function verifierProjet(projet: NouveauProjet): ErreursProjet {
  const erreurs: ErreursProjet = {}
  const nom = normaliserNom(projet.nom)
  if (nom.length < 3 || slugifier(nom).length < 3) erreurs.nom = 'Le nom doit faire au moins 3 caractères'
  else if (!/^[\p{L}\p{N}][\p{L}\p{N} ’-]*$/u.test(nom))
    erreurs.nom = 'Lettres, chiffres, espaces, tirets et apostrophes uniquement'
  else if (nom.length > 60) erreurs.nom = '60 caractères au maximum'
  if (projet.objectif.replace(/\s+/g, ' ').trim().length < 10)
    erreurs.objectif = 'Décrivez l’objectif en une ou deux phrases'
  if (!projet.modele) erreurs.modele = 'Choisissez une stack'
  const baseline = normaliserNom(projet.baseline)
  if (baseline.length > 80) erreurs.baseline = '80 caractères au maximum'
  else if (!/^[\p{L}\p{N} ’.,!?:;()«»-]*$/u.test(baseline))
    erreurs.baseline = 'Lettres, chiffres, espaces et ponctuation simple uniquement'
  return erreurs
}
