import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import FormulaireBug from '../FormulaireBug.vue'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const monter = () =>
  mount(FormulaireBug, { global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Formulaire de signalement', () => {
  it('exige le constat, l’attendu et les étapes, pas l’écran', async () => {
    const wrapper = monter()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')).toBeUndefined()
    expect(wrapper.text()).toContain('Indiquez comment reproduire le problème')
    expect(wrapper.text()).not.toContain('Écran ou adresse concerné (facultatif)Erreur')
    wrapper.unmount()
  })

  it('envoie un signalement nettoyé', async () => {
    const wrapper = monter()
    const champs = wrapper.findAll('input, textarea')
    await champs[0]!.setValue(' Liste vide le lundi ')
    await champs[1]!.setValue('Aucune salle le lundi')
    await champs[2]!.setValue('Les salles libres')
    await champs[3]!.setValue('1. Ouvrir la liste un lundi')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toEqual({
      titre: 'Liste vide le lundi',
      constate: 'Aucune salle le lundi',
      attendu: 'Les salles libres',
      etapes: '1. Ouvrir la liste un lundi',
      ecran: '',
    })
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité, à l’ouverture et avec les erreurs', async () => {
    const wrapper = monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await wrapper.find('form').trigger('submit')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
