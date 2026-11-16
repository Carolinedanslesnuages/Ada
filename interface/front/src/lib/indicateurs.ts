/** Indicateurs d'ADA (api/src/indicateurs/indicateurs.ts) et leur mise en forme. */
export interface Mesures {
  storiesLivrees: number
  partSansDev: number | null
  dureeMoyenneMinutes: number | null
}

export interface Indicateurs extends Mesures {
  projets: number
  parProjet: (Mesures & { nom: string })[]
}

const SANS_MESURE = 'Pas encore mesurable'

export const pourcentage = (part: number | null) =>
  part === null ? SANS_MESURE : `${Math.round(part * 100)} %`

/** « 25 min », « 1 h 05 », « 2 j 3 h ». */
export function duree(minutes: number | null): string {
  if (minutes === null) return SANS_MESURE
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`
  const heures = Math.floor(minutes / 60)
  if (heures < 24) return `${heures} h ${String(Math.round(minutes % 60)).padStart(2, '0')}`
  return `${Math.floor(heures / 24)} j ${heures % 24} h`
}
