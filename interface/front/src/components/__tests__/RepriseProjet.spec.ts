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
const DEPOTS: DepotAReprendre[] = [
  { id: 'commun', nom: 'commun', proprietaire: 'org', compte: 'organisation', description: null, url: 'https://github.com/org/commun', repriseEnCours: null },
  { id: 'un-po~mon-poc', nom: 'mon-poc', proprietaire: 'un-po', compte: 'personnel', description: null, url: 'https://github.com/un-po/mon-poc', repriseEnCours: null },
  { id: 'un-po~attente', nom: 'attente', proprietaire: 'un-po', compte: 'personnel', description: null, url: 'https://github.com/un-po/attente', repriseEnCours: 'https://github.com/un-po/attente/pull/2' },
]

describe('Reprendre un projet existant (#37)', () => {
  let projets: ReturnType<typeof useProjetsStore>
  const aReprendre = vi.fn<() => Promise<DepotAReprendre[]>>()
  const reprendre = vi.fn<(depot: string, modele: string, dsfr: boolean) => Promise<ResultatReprise>>()

  const monter = async () => {
    const wrapper = mount(RepriseProjet, { props: { modeles: MODELES }, global: { plugins: [VueDsfr] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    projets = useProjetsStore()
    aReprendre.mockResolvedValue(DEPOTS)
    reprendre.mockResolvedValue({ pullRequest: 'https://github.com/un-po/mon-poc/pull/1', fichiers: ['ada.json'] })
    projets.aReprendre = aReprendre
    projets.reprendre = reprendre
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('liste les dépôts de l’organisation et du compte du PO, et les seules stacks disponibles', async () => {
    const wrapper = await monter()
    const depots = wrapper.findAll('select')[0]!.findAll('option').map((option) => option.text())
    expect(depots).toEqual(expect.arrayContaining(['commun (organisation org)', 'mon-poc (votre compte un-po)']))
    const stacks = wrapper.findAll('select')[1]!.findAll('option').map((option) => option.text())
    expect(stacks).toContain('Vue + Node')
    expect(stacks).not.toContain('Django')
    wrapper.unmount()
  })

  it('exige un dépôt et une stack, puis propose la reprise et donne le lien de la PR à valider', async () => {
    const wrapper = await monter()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Choisissez le dépôt à reprendre')
    expect(reprendre).not.toHaveBeenCalled()

    await wrapper.findAll('select')[0]!.setValue('un-po~mon-poc')
    await wrapper.findAll('select')[1]!.setValue('vue-node')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(reprendre).toHaveBeenCalledWith('un-po~mon-poc', 'vue-node', false)
    expect(wrapper.find('a[href="https://github.com/un-po/mon-poc/pull/1"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('fusionnez-la sur GitHub')
    wrapper.unmount()
  })

  it('code existant : la stack est proposée sans DSFR, l’apparence du projet est gardée par défaut, le DSFR se choisit', async () => {
    const wrapper = await monter()
    await wrapper.findAll('select')[0]!.setValue('commun')
    const stacks = wrapper.findAll('select')[1]!.findAll('option').map((option) => option.text())
    expect(stacks).toContain('Vue + Node')
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios.map((radio) => (radio.element as HTMLInputElement).checked)).toEqual([true, false])
    await wrapper.findAll('select')[1]!.setValue('vue-node')
    await wrapper.findAll('input[type="radio"]')[1]!.trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(reprendre).toHaveBeenCalledWith('commun', 'vue-node', true)
    wrapper.unmount()
  })

  it('une reprise déjà proposée renvoie vers sa PR au lieu d’en ouvrir une autre', async () => {
    const wrapper = await monter()
    await wrapper.findAll('select')[0]!.setValue('un-po~attente')
    expect(wrapper.find('a[href="https://github.com/un-po/attente/pull/2"]').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('est accessible (formulaire et résultat)', async () => {
    const wrapper = await monter()
    expect(await violationsAccessibilite(wrapper.element)).toEqual([])
    await wrapper.findAll('select')[0]!.setValue('commun')
    await wrapper.findAll('select')[1]!.setValue('vue-node')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(await violationsAccessibilite(wrapper.element)).toEqual([])
    wrapper.unmount()
  })
})
