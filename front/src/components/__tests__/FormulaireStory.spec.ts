import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import FormulaireStory from '../FormulaireStory.vue'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const monter = () =>
  mount(FormulaireStory, { global: { plugins: [VueDsfr] }, attachTo: document.body })

const remplir = async (wrapper: ReturnType<typeof monter>) => {
  const champs = wrapper.findAll('input, textarea')
  await champs[0]!.setValue('Voir les salles libres')
  await champs[1]!.setValue("agent d'accueil")
  await champs[2]!.setValue('voir les salles libres en ce moment')
  await champs[3]!.setValue('proposer une salle sans appeler le service')
  await champs[4]!.setValue('  une salle sans réservation en cours est libre  ')
}

const boutonAjout = (wrapper: ReturnType<typeof monter>) =>
  wrapper.findAll('button').find((b) => b.text().includes('Ajouter un critère'))!

describe('Formulaire de story', () => {
  it('signale les champs manquants et n’envoie rien', async () => {
    const wrapper = monter()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')).toBeUndefined()
    expect(wrapper.text()).toContain('Indiquez qui a ce besoin')
    expect(wrapper.text()).toContain('Ajoutez au moins un critère d’acceptation')
    wrapper.unmount()
  })

  it('limite la story à 4 critères d’acceptation', async () => {
    const wrapper = monter()
    for (let i = 0; i < 5; i++) await boutonAjout(wrapper).trigger('click')
    const champsCritere = wrapper.findAll('label').filter((l) => /^Critère \d/.test(l.text()))
    expect(champsCritere).toHaveLength(4)
    expect(wrapper.text()).toContain('4 / 4')
    expect(boutonAjout(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('découpez en plusieurs stories')
    wrapper.unmount()
  })

  it('envoie une story nettoyée quand tout est rempli', async () => {
    const wrapper = monter()
    await remplir(wrapper)
    await boutonAjout(wrapper).trigger('click')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toEqual({
      titre: 'Voir les salles libres',
      role: "agent d'accueil",
      besoin: 'voir les salles libres en ce moment',
      benefice: 'proposer une salle sans appeler le service',
      criteres: ['une salle sans réservation en cours est libre'],
    })
    wrapper.unmount()
  })

  it('affiche les erreurs renvoyées par le serveur', async () => {
    const wrapper = mount(FormulaireStory, {
      global: { plugins: [VueDsfr] },
      props: { erreursServeur: { titre: 'Titre refusé par le serveur' } },
    })
    expect(wrapper.text()).toContain('Titre refusé par le serveur')
  })

  describe('Accessibilité (RGAA, contrôle automatique)', () => {
    it('aucune violation à l’ouverture', async () => {
      const wrapper = monter()
      expect(await violationsAccessibilite(document.body)).toEqual([])
      wrapper.unmount()
    })

    it('aucune violation avec des erreurs affichées', async () => {
      const wrapper = monter()
      await wrapper.find('form').trigger('submit')
      expect(await violationsAccessibilite(document.body)).toEqual([])
      wrapper.unmount()
    })
  })
})
