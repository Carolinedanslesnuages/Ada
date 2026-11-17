import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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

type Conseil = { modele: string; raison: string }
const monter = (conseiller?: (idee: string) => Promise<Conseil>) =>
  mount(FormulaireProjet, { props: { familles, types, modeles, conseiller }, global: { plugins: [VueDsfr] }, attachTo: document.body })

const IDEE = 'bon, trouver un collègue et son bureau, vite'
/** « Étape suivante » : le bouton principal du formulaire. */
const suivant = (wrapper: ReturnType<typeof monter>) => wrapper.find('form').trigger('submit')
const titreEtape = (wrapper: ReturnType<typeof monter>) => wrapper.find('.fr-stepper__title').text().replace(/\s+/g, ' ')
/** Étape 1 remplie (l'idée), puis passage à l'étape 2. */
const allerAuxStacks = async (wrapper: ReturnType<typeof monter>) => {
  await wrapper.find('textarea').setValue(IDEE)
  await suivant(wrapper)
}

describe('Formulaire de nouveau projet (étapier)', () => {
  it('commence par l’idée, en trois étapes annoncées ; l’idée est exigée pour avancer (#68)', async () => {
    const wrapper = monter()
    expect(titreEtape(wrapper)).toContain('Votre idée')
    expect(wrapper.text()).toContain('Étape 1 sur 3')
    expect(wrapper.find('#type-service').exists()).toBe(false)
    await suivant(wrapper)
    expect(wrapper.text()).toContain('Racontez votre idée, même en quelques mots')
    await wrapper.find('textarea').setValue('trajets')
    await suivant(wrapper)
    expect(wrapper.text()).toContain('une phrase au moins')
    expect(titreEtape(wrapper)).toContain('Votre idée')
    await wrapper.find('textarea').setValue(IDEE)
    await suivant(wrapper)
    expect(titreEtape(wrapper)).toContain('Type de projet et stack')
    expect(document.activeElement?.textContent).toContain('Type de projet et stack')
    wrapper.unmount()
  })

  it('regroupe les types par famille, sans famille vide ni rien « en attente de développement »', async () => {
    const wrapper = monter()
    await allerAuxStacks(wrapper)
    const legendes = wrapper.findAll('fieldset fieldset legend').map((legende) => legende.text())
    // « Dans un outil déjà utilisé » n'a aucun modèle livré ici (extension absente) : famille masquée.
    expect(legendes).toEqual(['Un service pour les usagers ou les agents', 'Pour montrer une idée'])
    expect(wrapper.findAll('input[name="type-projet"]')).toHaveLength(2)
    expect(wrapper.find('#type-formulaire').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('bientôt disponible')
    expect(wrapper.findAll('input[disabled]')).toHaveLength(0)
    expect(wrapper.find('#modele-vue-node').exists()).toBe(false)
    wrapper.unmount()
  })

  it('propose les stacks du type choisi, et exige un choix pour avancer', async () => {
    const wrapper = monter()
    await allerAuxStacks(wrapper)
    await suivant(wrapper)
    expect(wrapper.text()).toContain('Choisissez ce que vous voulez créer')
    await wrapper.find('#type-service').setValue(true)
    expect(wrapper.find('#modele-vue-nest-dsfr').exists()).toBe(true)
    expect(wrapper.find('#modele-vue-node').exists()).toBe(true)
    expect(wrapper.find('#modele-django').exists()).toBe(false)
    expect(wrapper.find('#modele-maquette').exists()).toBe(false)
    wrapper.unmount()
  })

  it('envoie le projet complet à la dernière étape ; on peut revenir en arrière sans rien perdre', async () => {
    const wrapper = monter()
    await allerAuxStacks(wrapper)
    await wrapper.find('#type-service').setValue(true)
    await wrapper.find('#modele-vue-node').setValue(true)
    await suivant(wrapper)
    expect(titreEtape(wrapper)).toContain('Nom et présentation')
    const champs = wrapper.findAll('input:not([type="radio"]):not([type="checkbox"])')
    await champs[0]!.setValue("L'annuaire des agents")
    expect(wrapper.text()).toContain('Adresse du dépôt : l-annuaire-des-agents')
    await champs[1]!.setValue("Qui fait quoi dans l'équipe")
    await wrapper.findAll('button').find((b) => b.text() === 'Étape précédente')!.trigger('click')
    expect((wrapper.find('#modele-vue-node').element as HTMLInputElement).checked).toBe(true)
    await suivant(wrapper)
    expect(wrapper.find('button[type="submit"]').text()).toBe('Créer le projet')
    await suivant(wrapper)
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toEqual({
      nom: 'L’annuaire des agents',
      idee: IDEE,
      objectif: '',
      modele: 'vue-node',
      baseline: 'Qui fait quoi dans l’équipe',
      deploye: false,
    })
    wrapper.unmount()
  })

  it('choisit d’office la seule stack d’un type, et exige un nom à la dernière étape', async () => {
    const wrapper = monter()
    await allerAuxStacks(wrapper)
    await wrapper.find('#type-maquette').setValue(true)
    await suivant(wrapper)
    await suivant(wrapper)
    expect(wrapper.emitted('soumettre')).toBeUndefined()
    expect(wrapper.text()).toContain('au moins 3 caractères')
    await wrapper.find('input').setValue('Annuaire')
    await suivant(wrapper)
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toMatchObject({ nom: 'Annuaire', modele: 'maquette' })
    wrapper.unmount()
  })

  it('propose de déployer le projet seulement pour un modèle déployable', async () => {
    const wrapper = monter()
    await allerAuxStacks(wrapper)
    await wrapper.find('#type-service').setValue(true)
    await wrapper.find('#modele-vue-nest-dsfr').setValue(true)
    expect(wrapper.find('#projet-deploye').exists()).toBe(false)
    await wrapper.find('#modele-vue-node').setValue(true)
    await wrapper.find('#projet-deploye').setValue(true)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await suivant(wrapper)
    await wrapper.find('input').setValue('Annuaire')
    await suivant(wrapper)
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toMatchObject({ modele: 'vue-node', deploye: true })
    wrapper.unmount()
  })

  it('l’assistant conseille une stack d’après l’idée : présélectionnée à l’étape suivante, modifiable (#68)', async () => {
    let repondre: (conseil: Conseil) => void = () => {}
    const conseiller = vi.fn<(idee: string) => Promise<Conseil>>(() => new Promise((fin) => (repondre = fin)))
    const wrapper = monter(conseiller)
    const bouton = () => wrapper.findAll('button').find((b) => b.text().includes('conseil') || b.text().includes('réfléchit'))!
    expect(bouton().attributes('disabled')).toBeDefined()
    await wrapper.find('textarea').setValue(IDEE)
    await bouton().trigger('click')
    expect(conseiller).toHaveBeenCalledWith(IDEE)
    expect(bouton().text()).toContain('réfléchit')
    repondre({ modele: 'vue-node', raison: 'Une petite application suffit.' })
    await flushPromises()
    expect(wrapper.text()).toContain('Conseil de l’assistant : Vue 3 + Node.js (Express). Une petite application suffit.')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await suivant(wrapper)
    expect((wrapper.find('#type-service').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('#modele-vue-node').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('label[for="modele-vue-node"]').text()).toContain('conseillée par l’assistant')
    // Le PO garde la main.
    await wrapper.find('#modele-vue-nest-dsfr').setValue(true)
    await suivant(wrapper)
    await wrapper.find('input').setValue('Annuaire')
    await suivant(wrapper)
    expect(wrapper.emitted('soumettre')?.[0]?.[0]).toMatchObject({ modele: 'vue-nest-dsfr' })
    wrapper.unmount()
  })

  it('conseil impossible : message clair, le PO choisit lui-même', async () => {
    const conseiller = vi.fn<(idee: string) => Promise<Conseil>>(async () => {
      throw new Error('L’assistant n’a pas pu proposer de stack : choisissez-la vous-même dans la liste.')
    })
    const wrapper = monter(conseiller)
    await wrapper.find('textarea').setValue(IDEE)
    await wrapper.findAll('button').find((b) => b.text().includes('conseil'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.fr-error-text').text()).toContain('choisissez-la vous-même')
    await suivant(wrapper)
    expect((wrapper.find('#type-service').element as HTMLInputElement).checked).toBe(false)
    wrapper.unmount()
  })

  it('erreur du serveur sur un champ : retour à l’étape qui le contient', async () => {
    const wrapper = monter()
    await allerAuxStacks(wrapper)
    await wrapper.find('#type-maquette').setValue(true)
    await suivant(wrapper)
    expect(titreEtape(wrapper)).toContain('Nom et présentation')
    await wrapper.setProps({ erreursServeur: { idee: 'Idée refusée' } })
    await flushPromises()
    expect(titreEtape(wrapper)).toContain('Votre idée')
    expect(wrapper.text()).toContain('Idée refusée')
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité à chaque étape, erreurs comprises', async () => {
    const wrapper = monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await suivant(wrapper)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await allerAuxStacks(wrapper)
    await suivant(wrapper)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await wrapper.find('#type-service').setValue(true)
    await wrapper.find('#modele-vue-node').setValue(true)
    await suivant(wrapper)
    await suivant(wrapper)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
