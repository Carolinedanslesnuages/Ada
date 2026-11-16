import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import FormulaireProjet from '../FormulaireProjet.vue'
import type { Modele, TypeDeProjet } from '@/lib/projet'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const types: TypeDeProjet[] = [
  { id: 'service', libelle: 'Service en ligne', description: 'Une application' },
  { id: 'formulaire', libelle: 'Formulaire', description: 'Recueillir des informations' },
  { id: 'extension', libelle: 'Extension de navigateur', description: 'Un outil dans le navigateur' },
  { id: 'maquette', libelle: 'Maquette', description: 'Un parcours cliquable' },
]
const modeles: Modele[] = [
  { id: 'vue-nest-dsfr', type: 'service', libelle: 'Vue 3 + NestJS', pourQuoi: 'Métier', disponible: true },
  { id: 'vue-node', type: 'service', libelle: 'Vue 3 + Node.js (Express)', pourQuoi: 'Petite application', disponible: true },
  { id: 'django', type: 'service', libelle: 'Python (Django)', pourQuoi: 'Back-office', disponible: false },
  { id: 'maquette', type: 'maquette', libelle: 'Maquette Vue 3', pourQuoi: 'Parcours cliquable', disponible: true },
  { id: 'formulaire', type: 'formulaire', libelle: 'Formulaire DSFR', pourQuoi: 'Réponses et export', disponible: false },
]

const monter = () =>
  mount(FormulaireProjet, { props: { types, modeles }, global: { plugins: [VueDsfr] }, attachTo: document.body })

const remplir = async (wrapper: ReturnType<typeof monter>) => {
  await wrapper.find('input:not([type="radio"])').setValue('Annuaire')
  await wrapper.find('textarea').setValue('Trouver un collègue et son bureau')
}

describe('Formulaire de nouveau projet', () => {
  it('demande d’abord ce que l’on veut créer ; les types sans modèle publié sont grisés', () => {
    const wrapper = monter()
    expect(wrapper.text()).toContain('Que voulez-vous créer ?')
    expect(wrapper.find('#type-service').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('#type-formulaire').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Formulaire (bientôt disponible)')
    expect(wrapper.find('#modele-vue-node').exists()).toBe(false)
    wrapper.unmount()
  })

  it('propose ensuite les stacks du type choisi', async () => {
    const wrapper = monter()
    await wrapper.find('#type-service').setValue(true)
    expect(wrapper.find('#modele-vue-nest-dsfr').exists()).toBe(true)
    expect(wrapper.find('#modele-vue-node').exists()).toBe(true)
    expect(wrapper.find('#modele-django').attributes('disabled')).toBeDefined()
    expect(wrapper.find('#modele-maquette').exists()).toBe(false)
    wrapper.unmount()
  })

  it('choisit d’office la seule stack disponible d’un type', async () => {
    const wrapper = monter()
    await remplir(wrapper)
    await wrapper.find('#type-maquette').setValue(true)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toMatchObject({ nom: 'Annuaire', modele: 'maquette' })
    wrapper.unmount()
  })

  it('montre l’adresse du dépôt et exige un type', async () => {
    const wrapper = monter()
    await wrapper.find('input:not([type="radio"])').setValue("L'annuaire des agents")
    expect(wrapper.text()).toContain('Adresse du dépôt : l-annuaire-des-agents')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')).toBeUndefined()
    expect(wrapper.text()).toContain('Choisissez ce que vous voulez créer')
    wrapper.unmount()
  })

  it('envoie le projet complet avec la stack choisie et la baseline', async () => {
    const wrapper = monter()
    await remplir(wrapper)
    await wrapper.findAll('input:not([type="radio"])')[1]!.setValue("Qui fait quoi dans l'équipe")
    await wrapper.find('#type-service').setValue(true)
    await wrapper.find('#modele-vue-node').setValue(true)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toEqual({
      nom: 'Annuaire',
      objectif: 'Trouver un collègue et son bureau',
      modele: 'vue-node',
      baseline: 'Qui fait quoi dans l’équipe',
    })
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité, à l’ouverture, après le choix du type et avec les erreurs', async () => {
    const wrapper = monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await wrapper.find('#type-service').setValue(true)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await wrapper.find('form').trigger('submit')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
