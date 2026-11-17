import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import IndicateursView from '../IndicateursView.vue'
import { api, ErreurApi } from '@/services/api'
import { duree, type Indicateurs } from '@/lib/indicateurs'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: { lire: vi.fn<(chemin: string) => Promise<unknown>>(), envoyer: vi.fn<(chemin: string, corps: unknown) => Promise<unknown>>() },
}))
const lire = vi.mocked(api.lire)

const INDICATEURS: Indicateurs = {
  projets: 2,
  historique: { total: 6, crees: 5, repris: 1, actifs: 2, archives: 0, retires: 0, supprimes: 4 },
  storiesLivrees: 5,
  dureeMoyenneMinutes: 25,
  parProjet: [
    { nom: 'pret-de-materiel', storiesLivrees: 5, dureeMoyenneMinutes: 25 },
    { nom: 'annuaire', storiesLivrees: 0, dureeMoyenneMinutes: null },
  ],
}

const monter = async () => {
  const wrapper = mount(IndicateursView, { global: { plugins: [VueDsfr] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('Page « Indicateurs »', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('compte tous les projets passés par ADA, y compris archivés, retirés et supprimés', async () => {
    lire.mockResolvedValue(INDICATEURS)
    const wrapper = await monter()
    const texte = wrapper.text()
    expect(texte).toContain('Tous les projets passés par ADA')
    expect(texte).toMatch(/Projets passés par ADA\s*6/)
    expect(texte).toMatch(/Supprimés de GitHub\s*4/)
    expect(texte).toMatch(/Archivés\s*0/)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('montre projets, stories livrées et temps moyen, sur l’ensemble', async () => {
    lire.mockResolvedValue(INDICATEURS)
    const wrapper = await monter()
    expect(lire).toHaveBeenCalledWith('/indicateurs')
    const cartes = wrapper.findAll('.indicateurs li').map((carte) => carte.findAll('p').map((ligne) => ligne.text()))
    expect(cartes).toEqual([
      ['2', 'Projets actifs dans ADA'],
      ['5', 'Stories livrées'],
      ['25 min', 'Temps moyen du lancement à la livraison'],
    ])
    wrapper.unmount()
  })

  it('détaille par projet, dans un tableau titré', async () => {
    lire.mockResolvedValue(INDICATEURS)
    const wrapper = await monter()
    const tableau = wrapper.findAll('table').find((element) => element.find('caption').text().includes('Indicateurs par projet'))!
    expect(tableau.exists()).toBe(true)
    const lignes = tableau.findAll('tbody tr').map((ligne) => ligne.findAll('td').map((cellule) => cellule.text()))
    expect(lignes).toEqual([
      ['pret-de-materiel', '5', '25 min'],
      ['annuaire', '0', 'Pas encore mesurable'],
    ])
    wrapper.unmount()
  })

  it('explique l’erreur si GitHub ne répond pas', async () => {
    lire.mockRejectedValue(new ErreurApi(502, 'GitHub ne répond pas'))
    const wrapper = await monter()
    expect(wrapper.text()).toContain('GitHub ne répond pas')
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité automatique', async () => {
    lire.mockResolvedValue(INDICATEURS)
    const wrapper = await monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})

describe('Mise en forme des indicateurs', () => {
  it.each([
    [null, 'Pas encore mesurable'],
    [0.2, '1 min'],
    [25, '25 min'],
    [65, '1 h 05'],
    [60 * 51, '2 j 3 h'],
  ])('durée %s min → « %s »', (minutes, texte) => {
    expect(duree(minutes)).toBe(texte)
  })

})
