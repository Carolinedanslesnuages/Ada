import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import PropositionDecoupage from '../PropositionDecoupage.vue'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const STORIES = [
  { titre: 'Voir le matériel', role: 'agent', besoin: 'voir la liste', benefice: 'savoir', criteres: ['Liste'] },
  { titre: 'Emprunter', role: 'agent', besoin: 'emprunter', benefice: 'éviter Excel', criteres: ['Bouton'] },
  { titre: 'Rendre', role: 'agent', besoin: 'rendre', benefice: 'libérer', criteres: ['Bouton Rendre'] },
]
const monter = () =>
  mount(PropositionDecoupage, { props: { stories: STORIES, designation: 'la demande n° 4' }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Proposition de découpage', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('présente chaque story (rôle, besoin, bénéfice, critères), toutes cochées au départ', () => {
    const wrapper = monter()
    expect(wrapper.findAll('input[type="checkbox"]').map((caseACocher) => (caseACocher.element as HTMLInputElement).checked)).toEqual([true, true, true])
    expect(wrapper.text()).toContain('En tant que agent, je veux emprunter, afin de éviter Excel.')
    expect(wrapper.find('button[type="submit"]').text()).toBe('Créer les 3 stories')
    expect(wrapper.text()).toContain('ADA créera ces stories sur GitHub, à votre nom')
    wrapper.unmount()
  })

  it('crée seulement les stories cochées (leurs numéros dans la proposition)', async () => {
    const wrapper = monter()
    await wrapper.find('#story-proposee-1').setValue(false)
    expect(wrapper.find('button[type="submit"]').text()).toBe('Créer les 2 stories')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('creer')).toEqual([[[0, 2]]])
    wrapper.unmount()
  })

  it('refuse de créer sans story cochée, et permet de demander un autre découpage', async () => {
    const wrapper = monter()
    for (const rang of [0, 1, 2]) await wrapper.find(`#story-proposee-${rang}`).setValue(false)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('creer')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').text()).toBe('Cochez au moins une story')
    await wrapper.findAll('button').find((bouton) => bouton.text() === 'Demander un autre découpage')!.trigger('click')
    expect(wrapper.emitted('autreDecoupage')).toHaveLength(1)
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité automatique', async () => {
    const wrapper = monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
