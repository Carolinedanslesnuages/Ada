import { describe, expect, it } from 'vitest'
import { asLightBulb, asFlight, tellingEquivalents, type Equivalents } from '../footprint'

const EQ: Equivalents = {
  streamingHourGrams: 64,
  carKmGrams: 142.25,
  webSearchGrams: 1.23,
  parisMarseilleReturnTrainGrams: 4400,
  parisNewYorkReturnFlightGrams: 2_060_000,
  ledBulbWatts: 10,
}

describe('footprint equivalents', () => {
  it('a few grams: web searches and minutes of streaming', () => {
    const [first, second] = tellingEquivalents({ min: 1.5, max: 4 }, EQ)
    expect(first).toContain('recherche')
    expect(second).toContain('min de streaming vidéo')
  })

  it('a few dozen grams: streaming and car', () => {
    const [first, second] = tellingEquivalents({ min: 48, max: 115 }, EQ)
    expect(first).toContain('h de streaming vidéo')
    expect(second).toContain('en voiture thermique')
  })

  it('a few kilos: car and high-speed train', () => {
    const [first, second] = tellingEquivalents({ min: 3000, max: 8000 }, EQ)
    expect(first).toContain('km en voiture thermique')
    expect(second).toContain('aller-retour Paris–Marseille en TGV')
  })

  it('more than a hundred kilos: high-speed train, then the flight as a percentage of a return trip', () => {
    const [first, second] = tellingEquivalents({ min: 120_000, max: 300_000 }, EQ)
    expect(first).toContain('en TGV')
    expect(second).toBe('5,8 à 15 % d’un aller-retour Paris–New York en avion')
  })

  it('the flight switches to a number of return trips beyond one trip', () => {
    expect(asFlight({ min: 2_060_000, max: 4_120_000 }, EQ.parisNewYorkReturnFlightGrams)).toBe('1 à 2 aller-retour Paris–New York en avion')
  })

  it('the light bulb translates the energy, with its assumed power', () => {
    expect(asLightBulb({ min: 12, max: 29 }, 10)).toBe('une ampoule LED de 10 W allumée 1,2 à 2,9 h')
    expect(asLightBulb({ min: 2, max: 5 }, 10)).toBe('une ampoule LED de 10 W allumée 12 à 30 min')
  })
})
