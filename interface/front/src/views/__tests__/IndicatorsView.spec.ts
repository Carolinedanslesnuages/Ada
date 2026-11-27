import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import IndicatorsView from '../IndicatorsView.vue'
import { api, ApiError } from '@/services/api'
import { duration, type Indicators } from '@/lib/indicators'
import type { AdaFootprint } from '@/lib/footprint'
import { accessibilityViolations } from '@/__tests__/accessibility'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: { read: vi.fn<(filePath: string) => Promise<unknown>>(), send: vi.fn<(filePath: string, body: unknown) => Promise<unknown>>() },
}))
const read = vi.mocked(api.read)

const INDICATORS: Indicators = {
  projects: 2,
  history: { total: 6, created: 5, adopted: 1, active: 2, archives: 0, removed: 0, deleted: 4 },
  deliveredStories: 5,
  averageDurationMinutes: 25,
  byProject: [
    { name: 'pret-de-materiel', deliveredStories: 5, averageDurationMinutes: 25 },
    { name: 'annuaire', deliveredStories: 0, averageDurationMinutes: null },
  ],
}

const FOOTPRINT: AdaFootprint = {
  total: { energyWh: { min: 120, max: 290 }, co2Grams: { min: 48, max: 115 }, outputTokenCount: 10000, inputTokenCount: 500000 },
  byProject: [
    { project: 'gladys', footprint: { energyWh: { min: 100, max: 240 }, co2Grams: { min: 40, max: 95 }, outputTokenCount: 8000, inputTokenCount: 400000 } },
    { project: 'secret-santa', footprint: { energyWh: { min: 20, max: 50 }, co2Grams: { min: 8, max: 20 }, outputTokenCount: 2000, inputTokenCount: 100000 } },
  ],
  since: '2026-11-18T10:00:00Z',
  equivalents: {
    streamingHourGrams: 64,
    carKmGrams: 142.25,
    webSearchGrams: 1.23,
    parisMarseilleReturnTrainGrams: 4400,
    parisNewYorkReturnFlightGrams: 2_060_000,
    ledBulbWatts: 10,
  },
  assumptions: { electricityGramsCo2PerKwh: 384, models: { opus: { totalBillions: 2000, activeBillions: { min: 200, max: 600 }, source: 'EcoLogits, estimation pour Claude 3 Opus' } } },
}

const mountComponent = async () => {
  const wrapper = mount(IndicatorsView, { global: { plugins: [VueDsfr] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('“Indicators” page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('counts every project that went through ADA, including archived, removed and deleted ones', async () => {
    read.mockImplementation(async (filePath: string) => (filePath === '/indicators/footprint' ? FOOTPRINT : INDICATORS))
    const wrapper = await mountComponent()
    const text = wrapper.text()
    expect(text).toContain('Ce que sont devenus les projets')
    expect(text).toContain('6 projets passés par ADA : 5 créés avec ADA, 1 repris')
    const legend = wrapper.findAll('.legend li').map((line) => line.text().replace(/\s+/g, ' '))
    expect(legend).toEqual(['2 Actifs dans ADA', '0 Archivés', '0 Retirés d’ADA (reprise annulée, désynchronisés)', '4 Supprimés de GitHub'])
    // The coloured bar is decorative: the legend gives the same figures as text.
    expect(wrapper.find('.outcome').attributes('aria-hidden')).toBe('true')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('shows projects, delivered stories and average time, overall', async () => {
    read.mockImplementation(async (filePath: string) => (filePath === '/indicators/footprint' ? FOOTPRINT : INDICATORS))
    const wrapper = await mountComponent()
    expect(read).toHaveBeenCalledWith('/indicators')
    const cards = wrapper.findAll('.figures li').map((card) => card.findAll('p').map((line) => line.text()))
    expect(cards).toEqual([
      ['6', 'Projets passés par ADA'],
      ['2', 'Projets actifs dans ADA'],
      ['5', 'Stories livrées'],
      ['25 min', 'Temps moyen du lancement à la livraison'],
    ])
    wrapper.unmount()
  })

  it('details per project, in a titled table', async () => {
    read.mockImplementation(async (filePath: string) => (filePath === '/indicators/footprint' ? FOOTPRINT : INDICATORS))
    const wrapper = await mountComponent()
    const table = wrapper.findAll('table').find((element) => element.find('caption').text().includes('Indicateurs par projet'))!
    expect(table.exists()).toBe(true)
    const lines = table.findAll('tbody tr').map((line) => line.findAll('td').map((cell) => cell.text()))
    expect(lines).toEqual([
      ['pret-de-materiel', '5', '25 min'],
      ['annuaire', '0', 'Pas encore mesurable'],
    ])
    wrapper.unmount()
  })

  it('during the computation: a skeleton of the page, announced to screen readers', async () => {
    read.mockReturnValue(new Promise(() => {}))
    const wrapper = await mountComponent()
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
    expect(wrapper.findAll('.skeleton__card')).toHaveLength(4)
    expect(wrapper.find('[role="status"]').text()).toBe('Calcul des indicateurs…')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('explains the error if GitHub does not respond', async () => {
    read.mockRejectedValue(new ApiError(502, 'GitHub ne répond pas'))
    const wrapper = await mountComponent()
    expect(wrapper.text()).toContain('GitHub ne répond pas')
    wrapper.unmount()
  })

  it('no automatic accessibility violation', async () => {
    read.mockImplementation(async (filePath: string) => (filePath === '/indicators/footprint' ? FOOTPRINT : INDICATORS))
    const wrapper = await mountComponent()
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})

describe('Formatting of the indicators', () => {
  it.each([
    [null, 'Pas encore mesurable'],
    [0.2, '1 min'],
    [25, '25 min'],
    [65, '1 h 05'],
    [60 * 51, '2 j 3 h'],
  ])('duration %s min → “%s”', (minutes, text) => {
    expect(duration(minutes)).toBe(text)
  })


  it('carbon footprint: range, ADEME equivalents, detail per project, method and limits', async () => {
    read.mockImplementation(async (filePath: string) => (filePath === '/indicators/footprint' ? FOOTPRINT : INDICATORS))
    const wrapper = await mountComponent()
    const section = wrapper.find('section[aria-labelledby="footprint-title"]')
    expect(section.text()).toContain('48 à 115 g CO2e')
    expect(section.text()).toContain('0,75 à 1,8 h de streaming vidéo')
    expect(section.text()).toContain('en voiture thermique')
    expect(section.text()).toContain('une ampoule LED de 10 W allumée')
    expect(section.text()).toContain('hypothèse d’ADA')
    expect(section.text()).toContain('gladys')
    expect(section.text()).toContain('EcoLogits')
    expect(section.text()).toContain('Anthropic ne publie ni la taille de ses modèles')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('footprint unavailable: the rest of the page is still displayed', async () => {
    read.mockImplementation(async (filePath: string) => {
      if (filePath === '/indicators/footprint') throw new Error('absent')
      return INDICATORS
    })
    const wrapper = await mountComponent()
    expect(wrapper.find('section[aria-labelledby="footprint-title"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Stories livrées')
    wrapper.unmount()
  })
})
