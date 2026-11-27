/** Estimated carbon footprint of ADA's usage (computed by the API: EcoLogits method, ADEME equivalents). */
export interface Range {
  min: number
  max: number
}

export interface Footprint {
  energyWh: Range
  co2Grams: Range
  outputTokenCount: number
  inputTokenCount: number
}

/** ADEME equivalents (Impact CO2), in g CO2e; `ledBulbWatts` is ADA's assumption (in watts). */
export interface Equivalents {
  streamingHourGrams: number
  carKmGrams: number
  webSearchGrams: number
  parisMarseilleReturnTrainGrams: number
  parisNewYorkReturnFlightGrams: number
  ledBulbWatts: number
}

export interface AdaFootprint {
  total: Footprint
  byProject: { project: string; footprint: Footprint }[]
  since: string | null
  equivalents: Equivalents
  assumptions: {
    electricityGramsCo2PerKwh: number
    models: Record<string, { totalBillions: number; activeBillions: Range; source: string }>
  }
}

const count = (value: number, decimals = 0) =>
  value.toLocaleString('fr-FR', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })

/** Two significant digits are enough: it is an estimate. */
const rounded = (value: number) => (value >= 100 ? Math.round(value) : value >= 10 ? Math.round(value) : Number(value.toPrecision(2)))

function range(f: Range, unit: string, divisor = 1): string {
  const min = rounded(f.min / divisor)
  const max = rounded(f.max / divisor)
  return min === max ? `${count(min, 2)} ${unit}` : `${count(min, 2)} à ${count(max, 2)} ${unit}`
}

export function formatCo2(f: Range): string {
  return f.max >= 1000 ? range(f, 'kg CO2e', 1000) : range(f, 'g CO2e')
}

export function formatEnergy(f: Range): string {
  return f.max >= 1000 ? range(f, 'kWh', 1000) : range(f, 'Wh')
}

/** Hours of video streaming (ADEME, Impact CO2): in minutes below one hour. */
export function asStreaming(co2Grams: Range, gramsPerHour: number): string {
  const hours = { min: co2Grams.min / gramsPerHour, max: co2Grams.max / gramsPerHour }
  return hours.max < 1
    ? `${range({ min: hours.min * 60, max: hours.max * 60 }, 'min')} de streaming vidéo`
    : `${range(hours, 'h')} de streaming vidéo`
}

/** Distance in a combustion car (ADEME, Impact CO2): in metres below one kilometre. */
export function asCar(co2Grams: Range, gramsPerKm: number): string {
  const km = { min: co2Grams.min / gramsPerKm, max: co2Grams.max / gramsPerKm }
  return km.max < 1 ? `${range({ min: km.min * 1000, max: km.max * 1000 }, 'm')} en voiture thermique` : `${range(km, 'km')} en voiture thermique`
}

/** Web searches (ADEME, Impact CO2): for the very small totals. */
export function asWebSearches(co2Grams: Range, gramsPerSearch: number): string {
  const times = { min: co2Grams.min / gramsPerSearch, max: co2Grams.max / gramsPerSearch }
  return `${range(times, times.max < 2 ? 'recherche web' : 'recherches web')}`
}

/** Paris–Marseille return trips by high-speed train (ADEME, Impact CO2 practical case). */
export function asTrain(co2Grams: Range, gramsPerReturnTrip: number): string {
  const trips = { min: co2Grams.min / gramsPerReturnTrip, max: co2Grams.max / gramsPerReturnTrip }
  return `${range(trips, 'aller-retour Paris–Marseille en TGV')}`
}

/** Paris–New York return flights (ADEME, Impact CO2 practical case): as a percentage below one trip. */
export function asFlight(co2Grams: Range, gramsPerReturnTrip: number): string {
  const trips = { min: co2Grams.min / gramsPerReturnTrip, max: co2Grams.max / gramsPerReturnTrip }
  return trips.max < 1
    ? range({ min: trips.min * 100, max: trips.max * 100 }, '% d’un aller-retour Paris–New York en avion')
    : range(trips, 'aller-retour Paris–New York en avion')
}

/** A switched-on LED bulb: translates an ENERGY (not CO2), with the power assumed by ADA. */
export function asLightBulb(energyWh: Range, watts: number): string {
  const hours = { min: energyWh.min / watts, max: energyWh.max / watts }
  const duration = hours.max < 1 ? range({ min: hours.min * 60, max: hours.max * 60 }, 'min') : range(hours, 'h')
  return `une ampoule LED de ${watts} W allumée ${duration}`
}

/**
 * Two telling equivalents, chosen according to the order of magnitude of the total (a “0.0001 return
 * flight” would mean nothing): from a few grams to several kilos, the comparison changes scale.
 */
export function tellingEquivalents(co2Grams: Range, eq: Equivalents): [string, string] {
  const middle = (co2Grams.min + co2Grams.max) / 2
  if (middle < 20) return [asWebSearches(co2Grams, eq.webSearchGrams), asStreaming(co2Grams, eq.streamingHourGrams)]
  if (middle < 1000) return [asStreaming(co2Grams, eq.streamingHourGrams), asCar(co2Grams, eq.carKmGrams)]
  if (middle < 100_000) return [asCar(co2Grams, eq.carKmGrams), asTrain(co2Grams, eq.parisMarseilleReturnTrainGrams)]
  return [asTrain(co2Grams, eq.parisMarseilleReturnTrainGrams), asFlight(co2Grams, eq.parisNewYorkReturnFlightGrams)]
}
