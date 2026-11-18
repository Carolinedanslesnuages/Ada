/** Empreinte carbone estimée de l'usage d'ADA (calcul côté API : méthode EcoLogits, équivalents ADEME). */
export interface Fourchette {
  min: number
  max: number
}

export interface Empreinte {
  energieWh: Fourchette
  co2g: Fourchette
  tokensSortie: number
  tokensEntree: number
}

export interface EmpreinteAda {
  total: Empreinte
  parProjet: { projet: string; empreinte: Empreinte }[]
  depuis: string | null
  equivalents: { streamingHeureG: number; voitureKmG: number }
  hypotheses: {
    electriciteGCo2ParKwh: number
    modeles: Record<string, { totalMilliards: number; actifsMilliards: Fourchette; source: string }>
  }
}

const nombre = (valeur: number, decimales = 0) =>
  valeur.toLocaleString('fr-FR', { maximumFractionDigits: decimales, minimumFractionDigits: 0 })

/** Deux chiffres significatifs suffisent : c'est une estimation. */
const arrondi = (valeur: number) => (valeur >= 100 ? Math.round(valeur) : valeur >= 10 ? Math.round(valeur) : Number(valeur.toPrecision(2)))

function fourchette(f: Fourchette, unite: string, diviseur = 1): string {
  const min = arrondi(f.min / diviseur)
  const max = arrondi(f.max / diviseur)
  return min === max ? `${nombre(min, 2)} ${unite}` : `${nombre(min, 2)} à ${nombre(max, 2)} ${unite}`
}

export function formaterCo2(f: Fourchette): string {
  return f.max >= 1000 ? fourchette(f, 'kg CO2e', 1000) : fourchette(f, 'g CO2e')
}

export function formaterEnergie(f: Fourchette): string {
  return f.max >= 1000 ? fourchette(f, 'kWh', 1000) : fourchette(f, 'Wh')
}

/** Heures de streaming vidéo (ADEME, Impact CO2) : en minutes en dessous d'une heure. */
export function enStreaming(co2g: Fourchette, gParHeure: number): string {
  const heures = { min: co2g.min / gParHeure, max: co2g.max / gParHeure }
  return heures.max < 1
    ? `${fourchette({ min: heures.min * 60, max: heures.max * 60 }, 'min')} de streaming vidéo`
    : `${fourchette(heures, 'h')} de streaming vidéo`
}

/** Distance en voiture thermique (ADEME, Impact CO2) : en mètres en dessous d'un kilomètre. */
export function enVoiture(co2g: Fourchette, gParKm: number): string {
  const km = { min: co2g.min / gParKm, max: co2g.max / gParKm }
  return km.max < 1 ? `${fourchette({ min: km.min * 1000, max: km.max * 1000 }, 'm')} en voiture thermique` : `${fourchette(km, 'km')} en voiture thermique`
}
