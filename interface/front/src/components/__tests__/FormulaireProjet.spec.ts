import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import FormulaireProjet from '../FormulaireProjet.vue'
import type { FamilleDeProjet, Modele, TypeDeProjet } from '@/lib/projet'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const familles: FamilleDeProjet[] = [
  { id: 'service', libelle: 'Un service pour les usagers ou les agents' },
  { id: 'outil-existant', libelle: 'Dans un outil déjà utilisé' },
  { id: 'sans-ecran', libelle: 'Sans écran : données et automatisation' },
  { id: 'idee', libelle: 'Pour montrer une idée' },
]
const types: TypeDeProjet[] = [
  { id: 'service', famille: 'service', libelle: 'Service en ligne', description: 'Une application' },
  { id: 'formulaire', famille: 'service', libelle: 'Formulaire', description: 'Recueillir des informations' },
  { id: 'extension', famille: 'outil-existant', libelle: 'Extension de navigateur', description: 'Un outil dans le navigateur' },
  { id: 'maquette', famille: 'idee', libelle: 'Maquette', description: 'Un parcours cliquable' },
]
const modeles: Modele[] = [
  { id: 'vue-nest-dsfr', type: 'service', libelle: 'Vue 3 + NestJS', pourQuoi: 'Métier', disponible: true, deployable: false },
  { id: 'vue-node', type: 'service', libelle: 'Vue 3 + Node.js (Express)', pourQuoi: 'Petite application', disponible: true, deployable: true },
  { id: 'django', type: 'service', libelle: 'Python (Django)', pourQuoi: 'Back-office', disponible: false, deployable: false },
  { id: 'maquette', type: 'maquette', libelle: 'Maquette Vue 3', pourQuoi: 'Parcours cliquable', disponible: true, deployable: false },
  { id: 'formulaire', type: 'formulaire', libelle: 'Formulaire DSFR', pourQuoi: 'Réponses et export', disponible: false, deployable: false },
]

const monter = () =>
  mount(FormulaireProjet, { props: { familles, types, modeles }, global: { plugins: [VueDsfr] }, attachTo: document.body })

const remplir = async (wrapper: ReturnType<typeof monter>) => {
  await wrapper.find('input:not([type="radio"])').setValue('Annuaire')
  // Premier champ long : l'idée, racontée librement (#68).
  await wrapper.find('textarea').setValue('bon, trouver un collègue et son bureau, vite')
}

describe('Formulaire de nouveau projet', () => {
  it('regroupe les types par famille, sans afficher une famille vide', () => {
    const wrapper = monter()
    const legendes = wrapper.findAll('fieldset fieldset legend').map((legende) => legende.text())
    // « Dans un outil déjà utilisé » n'a aucun modèle livré ici (extension absente) : famille masquée.
    expect(legendes).toEqual(['Un service pour les usagers ou les agents', 'Pour montrer une idée'])
    // « Formulaire » n'a que des modèles non livrés : il n'apparaît pas.
    expect(wrapper.findAll('input[name="type-projet"]')).toHaveLength(2)
    wrapper.unmount()
  })

  it('demande d’abord ce que l’on veut créer ; rien n’est montré « en attente de développement »', () => {
    const wrapper = monter()
    expect(wrapper.text()).toContain('Que voulez-vous créer ?')
    expect(wrapper.find('#type-service').exists()).toBe(true)
    expect(wrapper.find('#type-formulaire').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('bientôt disponible')
    expect(wrapper.findAll('input[disabled]')).toHaveLength(0)
    expect(wrapper.find('#modele-vue-node').exists()).toBe(false)
    wrapper.unmount()
  })

  it('propose ensuite les stacks du type choisi', async () => {
    const wrapper = monter()
    await wrapper.find('#type-service').setValue(true)
    expect(wrapper.find('#modele-vue-nest-dsfr').exists()).toBe(true)
    expect(wrapper.find('#modele-vue-node').exists()).toBe(true)
    expect(wrapper.find('#modele-django').exists()).toBe(false)
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
      idee: 'bon, trouver un collègue et son bureau, vite',
      objectif: '',
      modele: 'vue-node',
      baseline: 'Qui fait quoi dans l’équipe',
      deploye: false,
    })
    wrapper.unmount()
  })

  it('propose de déployer le projet seulement pour un modèle déployable', async () => {
    const wrapper = monter()
    await remplir(wrapper)
    await wrapper.find('#type-service').setValue(true)
    await wrapper.find('#modele-vue-nest-dsfr').setValue(true)
    expect(wrapper.find('#projet-deploye').exists()).toBe(false)
    await wrapper.find('#modele-vue-node').setValue(true)
    await wrapper.find('#projet-deploye').setValue(true)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toMatchObject({ modele: 'vue-node', deploye: true })
    wrapper.unmount()
  })

  it('l’idée suffit : objectif facultatif ; sans idée ni objectif, on demande de raconter l’idée (#68)', async () => {
    const wrapper = monter()
    const champs = wrapper.findAll('textarea')
    expect(champs).toHaveLength(2)
    expect(wrapper.find(`label[for="${champs[0]!.attributes('id')}"]`).text()).toContain('Votre idée')
    expect(wrapper.find(`label[for="${champs[1]!.attributes('id')}"]`).text()).toContain('facultatif')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Racontez votre idée, même en quelques mots')
    await champs[0]!.setValue('trajets')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('une phrase au moins')
    expect(wrapper.emitted('soumettre')).toBeUndefined()
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
