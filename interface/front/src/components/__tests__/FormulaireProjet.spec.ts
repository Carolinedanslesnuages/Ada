import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import FormulaireProjet from '../FormulaireProjet.vue'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const modeles = [
  { id: 'vue-nest-dsfr', libelle: 'Vue 3 + NestJS + PostgreSQL, avec DSFR', pourQuoi: 'Application métier', depot: 'p/modele' },
  { id: 'django', libelle: 'Python (Django)', pourQuoi: 'Back-office', depot: null },
]

const monter = () =>
  mount(FormulaireProjet, { props: { modeles }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Formulaire de nouveau projet', () => {
  it('montre l’adresse du dépôt calculée depuis le nom', async () => {
    const wrapper = monter()
    await wrapper.find('input[type="text"], input:not([type])').setValue("L'annuaire des agents")
    expect(wrapper.text()).toContain('Adresse du dépôt : l-annuaire-des-agents')
    wrapper.unmount()
  })

  it('n’autorise que les stacks dont le modèle existe', () => {
    const wrapper = monter()
    expect(wrapper.find('#modele-vue-nest-dsfr').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('#modele-django').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Python (Django) (bientôt disponible)')
    wrapper.unmount()
  })

  it('signale les champs manquants sans rien envoyer', async () => {
    const wrapper = monter()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')).toBeUndefined()
    expect(wrapper.text()).toContain('Choisissez une stack')
    expect(wrapper.text()).toContain('Décrivez l’objectif')
    wrapper.unmount()
  })

  it('envoie le projet avec un nom sans apostrophe droite', async () => {
    const wrapper = monter()
    const champsTexte = wrapper.findAll('input:not([type="radio"])')
    await champsTexte[0]!.setValue("  L'annuaire  ")
    await champsTexte[1]!.setValue("Qui fait quoi dans l'équipe")
    await wrapper.find('textarea').setValue('Trouver un collègue et son bureau')
    await wrapper.find('#modele-vue-nest-dsfr').setValue(true)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toEqual({
      nom: 'L’annuaire',
      objectif: 'Trouver un collègue et son bureau',
      modele: 'vue-nest-dsfr',
      baseline: 'Qui fait quoi dans l’équipe',
    })
  })

  it('accepte un projet sans baseline, mais refuse des guillemets', async () => {
    const wrapper = monter()
    const champsTexte = wrapper.findAll('input:not([type="radio"])')
    await champsTexte[0]!.setValue('Annuaire')
    await wrapper.find('textarea').setValue('Trouver un collègue et son bureau')
    await wrapper.find('#modele-vue-nest-dsfr').setValue(true)
    await champsTexte[1]!.setValue('Le "meilleur" annuaire')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')).toBeUndefined()
    expect(wrapper.text()).toContain('ponctuation simple')
    await champsTexte[1]!.setValue('')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toMatchObject({ nom: 'Annuaire', baseline: '' })
    wrapper.unmount()
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
