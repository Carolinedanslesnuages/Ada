import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import VueDsfr from '@gouvminint/vue-dsfr'
import RepriseProjet from '../RepriseProjet.vue'
import { useProjetsStore, type DepotAReprendre, type ResultatReprise } from '@/stores/projets'
import type { Modele } from '@/lib/projet'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const MODELES: Modele[] = [
  { id: 'vue-node', type: 'service', libelle: 'Vue + Node, avec DSFR', pourQuoi: 'Un service web complet', disponible: true, deployable: true },
  { id: 'django', type: 'service', libelle: 'Django', pourQuoi: 'Pas encore', disponible: false, deployable: false },
]
const candidat = (id: string, nom: string, proprietaire: string, extra: Partial<DepotAReprendre> = {}): DepotAReprendre => ({
  id,
  nom,
  proprietaire,
  compte: proprietaire === 'org' ? 'organisation' : 'personnel',
  description: null,
  url: `https://github.com/${proprietaire}/${nom}`,
  repriseEnCours: null,
  analyseEnCours: false,
  ...extra,
})
const DEPOTS = [
  candidat('commun', 'commun', 'org'),
  candidat('un-po~mon-poc', 'mon-poc', 'un-po'),
  candidat('un-po~attente', 'attente', 'un-po', { repriseEnCours: 'https://github.com/un-po/attente/pull/2' }),
  candidat('un-po~analyse', 'analyse', 'un-po', { analyseEnCours: true }),
]

describe('Reprendre un projet existant (#37)', () => {
  let projets: ReturnType<typeof useProjetsStore>
  const aReprendre = vi.fn<() => Promise<DepotAReprendre[]>>()
  const reprendre = vi.fn<(depot: string, modele: string | null, dsfr: boolean) => Promise<ResultatReprise>>()

  const monter = async () => {
    const wrapper = mount(RepriseProjet, { props: { modeles: MODELES, intervalleSuivi: 20 }, global: { plugins: [VueDsfr] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const selects = (wrapper: Awaited<ReturnType<typeof monter>>) => wrapper.findAll('select')

  beforeEach(() => {
    setActivePinia(createPinia())
    projets = useProjetsStore()
    aReprendre.mockReset().mockResolvedValue(DEPOTS)
    reprendre.mockReset().mockResolvedValue({ analyse: 'https://github.com/un-po/mon-poc/issues/7', pullRequest: null })
    projets.aReprendre = aReprendre
    projets.reprendre = reprendre
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('liste les dépôts de l’organisation et du compte du PO ; stack facultative, sans mention du DSFR', async () => {
    const wrapper = await monter()
    expect(selects(wrapper)[0]!.findAll('option').map((option) => option.text())).toEqual(
      expect.arrayContaining(['commun (organisation org)', 'mon-poc (votre compte un-po)']),
    )
    await selects(wrapper)[0]!.setValue('commun')
    const stacks = selects(wrapper)[1]!.findAll('option').map((option) => option.text())
    expect(stacks).toContain('Je ne sais pas : l’assistant la déduit')
    expect(stacks).toContain('Vue + Node')
    expect(stacks).not.toContain('Django')
    wrapper.unmount()
  })

  it('sans stack : lance l’analyse, puis suit jusqu’à la PR de reprise', async () => {
    const wrapper = await monter()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Choisissez le dépôt à reprendre')
    expect(reprendre).not.toHaveBeenCalled()

    await selects(wrapper)[0]!.setValue('un-po~mon-poc')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(reprendre).toHaveBeenCalledWith('un-po~mon-poc', null, false)
    expect(wrapper.text()).toContain('L’assistant analyse le projet')
    expect(wrapper.find('a[href="https://github.com/un-po/mon-poc/issues/7"]').exists()).toBe(true)

    aReprendre.mockResolvedValue([candidat('un-po~mon-poc', 'mon-poc', 'un-po', { repriseEnCours: 'https://github.com/un-po/mon-poc/pull/8' })])
    await new Promise((fin) => setTimeout(fin, 40))
    await flushPromises()
    expect(wrapper.text()).toContain('La pull request de reprise est prête')
    expect(wrapper.find('a[href="https://github.com/un-po/mon-poc/pull/8"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('analyse arrêtée sans PR : le PO est prévenu et renvoyé vers l’explication', async () => {
    const wrapper = await monter()
    await selects(wrapper)[0]!.setValue('un-po~mon-poc')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    aReprendre.mockResolvedValue([candidat('un-po~mon-poc', 'mon-poc', 'un-po')])
    await new Promise((fin) => setTimeout(fin, 40))
    await flushPromises()
    expect(wrapper.text()).toContain('L’analyse s’est arrêtée sans pull request')
    wrapper.unmount()
  })

  it('avec une stack et le DSFR choisis', async () => {
    const wrapper = await monter()
    await selects(wrapper)[0]!.setValue('commun')
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios.map((radio) => (radio.element as HTMLInputElement).checked)).toEqual([true, false])
    await selects(wrapper)[1]!.setValue('vue-node')
    await radios[1]!.trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(reprendre).toHaveBeenCalledWith('commun', 'vue-node', true)
    wrapper.unmount()
  })

  it('reprise déjà proposée ou analyse en cours : pas de nouvelle demande', async () => {
    const wrapper = await monter()
    await selects(wrapper)[0]!.setValue('un-po~attente')
    expect(wrapper.find('a[href="https://github.com/un-po/attente/pull/2"]').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    await selects(wrapper)[0]!.setValue('un-po~analyse')
    expect(wrapper.text()).toContain('L’assistant analyse déjà ce projet')
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('est accessible (formulaire et suivi)', async () => {
    const wrapper = await monter()
    await selects(wrapper)[0]!.setValue('commun')
    expect(await violationsAccessibilite(wrapper.element)).toEqual([])
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(await violationsAccessibilite(wrapper.element)).toEqual([])
    wrapper.unmount()
  })
})
