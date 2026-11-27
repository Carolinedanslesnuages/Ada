import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ProjectForm from '../ProjectForm.vue'
import type { ProjectFamily, Template, ProjectTypeOption } from '@/lib/project'
import { accessibilityViolations } from '@/__tests__/accessibility'

const families: ProjectFamily[] = [
  { id: 'service', label: 'Un service pour les usagers ou les agents' },
  { id: 'outil-existant', label: 'Dans un outil déjà utilisé' },
  { id: 'sans-ecran', label: 'Sans écran : données et automatisation' },
  { id: 'idea', label: 'Pour montrer une idée' },
]
const types: ProjectTypeOption[] = [
  { id: 'service', family: 'service', label: 'Service en ligne', description: 'Une application' },
  { id: 'formulaire', family: 'service', label: 'Formulaire', description: 'Recueillir des informations' },
  { id: 'extension', family: 'outil-existant', label: 'Extension de navigateur', description: 'Un outil dans le navigateur' },
  { id: 'maquette', family: 'idea', label: 'Maquette', description: 'Un parcours cliquable' },
]
const templates: Template[] = [
  { id: 'vue-nest-dsfr', type: 'service', label: 'Vue 3 + NestJS', purpose: 'Métier', available: true, deployable: false },
  { id: 'vue-node', type: 'service', label: 'Vue 3 + Node.js (Express)', purpose: 'Petite application', available: true, deployable: true },
  { id: 'django', type: 'service', label: 'Python (Django)', purpose: 'Back-office', available: false, deployable: false },
  { id: 'maquette', type: 'maquette', label: 'Maquette Vue 3', purpose: 'Parcours cliquable', available: true, deployable: false },
  { id: 'formulaire', type: 'formulaire', label: 'Formulaire DSFR', purpose: 'Réponses et export', available: false, deployable: false },
]

type Advice = { template: string; reason: string }
const mountComponent = (adviser?: (idea: string) => Promise<Advice>) =>
  mount(ProjectForm, { props: { families, types, templates, adviser }, global: { plugins: [VueDsfr] }, attachTo: document.body })

const IDEA = 'bon, trouver un collègue et son bureau, vite'
/** “Étape suivante”: the main button of the form. */
const next = (wrapper: ReturnType<typeof mountComponent>) => wrapper.find('form').trigger('submit')
const stepTitle = (wrapper: ReturnType<typeof mountComponent>) => wrapper.find('.fr-stepper__title').text().replace(/\s+/g, ' ')
/** Step 1 filled in (the idea), then move to step 2. */
const goToStacks = async (wrapper: ReturnType<typeof mountComponent>) => {
  await wrapper.find('textarea').setValue(IDEA)
  await next(wrapper)
}

describe('New project form (stepper)', () => {
  it('starts with the idea, in three announced steps; the idea is required to move on (#68)', async () => {
    const wrapper = mountComponent()
    expect(stepTitle(wrapper)).toContain('Votre idée')
    expect(wrapper.text()).toContain('Étape 1 sur 3')
    expect(wrapper.find('#type-service').exists()).toBe(false)
    await next(wrapper)
    expect(wrapper.text()).toContain('Racontez votre idée, même en quelques mots')
    await wrapper.find('textarea').setValue('trajets')
    await next(wrapper)
    expect(wrapper.text()).toContain('une phrase au moins')
    expect(stepTitle(wrapper)).toContain('Votre idée')
    await wrapper.find('textarea').setValue(IDEA)
    await next(wrapper)
    expect(stepTitle(wrapper)).toContain('Type de projet et stack')
    expect(document.activeElement?.textContent).toContain('Type de projet et stack')
    wrapper.unmount()
  })

  it('groups the types by family, without an empty family or anything “en attente de développement”', async () => {
    const wrapper = mountComponent()
    await goToStacks(wrapper)
    const legends = wrapper.findAll('fieldset fieldset legend').map((legend) => legend.text())
    // “Dans un outil déjà utilisé” has no shipped template here (extension absent): family hidden.
    expect(legends).toEqual(['Un service pour les usagers ou les agents', 'Pour montrer une idée'])
    expect(wrapper.findAll('input[name="project-type"]')).toHaveLength(2)
    expect(wrapper.find('#type-formulaire').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('bientôt disponible')
    expect(wrapper.findAll('input[disabled]')).toHaveLength(0)
    expect(wrapper.find('#template-vue-node').exists()).toBe(false)
    wrapper.unmount()
  })

  it('offers the stacks of the chosen type, and requires a choice to move on', async () => {
    const wrapper = mountComponent()
    await goToStacks(wrapper)
    await next(wrapper)
    expect(wrapper.text()).toContain('Choisissez ce que vous voulez créer')
    await wrapper.find('#type-service').setValue(true)
    expect(wrapper.find('#template-vue-nest-dsfr').exists()).toBe(true)
    expect(wrapper.find('#template-vue-node').exists()).toBe(true)
    expect(wrapper.find('#template-django').exists()).toBe(false)
    expect(wrapper.find('#template-maquette').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sends the complete project at the last step; going back loses nothing', async () => {
    const wrapper = mountComponent()
    await goToStacks(wrapper)
    await wrapper.find('#type-service').setValue(true)
    await wrapper.find('#template-vue-node').setValue(true)
    await next(wrapper)
    expect(stepTitle(wrapper)).toContain('Nom et présentation')
    const fields = wrapper.findAll('input:not([type="radio"]):not([type="checkbox"])')
    await fields[0]!.setValue("L'annuaire des agents")
    expect(wrapper.text()).toContain('Adresse du dépôt : l-annuaire-des-agents')
    await fields[1]!.setValue("Qui fait quoi dans l'équipe")
    await wrapper.findAll('button').find((b) => b.text() === 'Étape précédente')!.trigger('click')
    expect((wrapper.find('#template-vue-node').element as HTMLInputElement).checked).toBe(true)
    await next(wrapper)
    expect(wrapper.find('button[type="submit"]').text()).toBe('Créer le projet')
    await next(wrapper)
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      name: 'L’annuaire des agents',
      idea: IDEA,
      objective: '',
      template: 'vue-node',
      baseline: 'Qui fait quoi dans l’équipe',
      deployed: false,
      visibility: 'private',
    })
    wrapper.unmount()
  })

  it('automatically chooses the only stack of a type, and requires a name at the last step', async () => {
    const wrapper = mountComponent()
    await goToStacks(wrapper)
    await wrapper.find('#type-maquette').setValue(true)
    await next(wrapper)
    await next(wrapper)
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('au moins 3 caractères')
    await wrapper.find('input').setValue('Annuaire')
    await next(wrapper)
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: 'Annuaire', template: 'maquette' })
    wrapper.unmount()
  })

  it('private repository by default; the PO can make it public', async () => {
    const wrapper = mountComponent()
    await goToStacks(wrapper)
    await wrapper.find('#type-maquette').setValue(true)
    await next(wrapper)
    const choice = wrapper.findAll('input[name="visibility"]')
    expect(choice).toHaveLength(2)
    expect((choice[0]!.element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.text()).toContain('Tout le monde peut voir le code sur GitHub')
    expect(await accessibilityViolations(document.body)).toEqual([])
    await choice[1]!.trigger('click')
    await wrapper.find('input').setValue('Annuaire')
    await next(wrapper)
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: 'Annuaire', visibility: 'public' })
    wrapper.unmount()
  })

  it('offers to deploy the project only for a deployable template', async () => {
    const wrapper = mountComponent()
    await goToStacks(wrapper)
    await wrapper.find('#type-service').setValue(true)
    await wrapper.find('#template-vue-nest-dsfr').setValue(true)
    expect(wrapper.find('#deployed-project').exists()).toBe(false)
    await wrapper.find('#template-vue-node').setValue(true)
    await wrapper.find('#deployed-project').setValue(true)
    expect(await accessibilityViolations(document.body)).toEqual([])
    await next(wrapper)
    await wrapper.find('input').setValue('Annuaire')
    await next(wrapper)
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ template: 'vue-node', deployed: true })
    wrapper.unmount()
  })

  it('ADA advises a stack from the idea: preselected at the next step, editable (#68)', async () => {
    let reply: (advice: Advice) => void = () => {}
    const adviser = vi.fn<(idea: string) => Promise<Advice>>(() => new Promise((end) => (reply = end)))
    const wrapper = mountComponent(adviser)
    const button = () => wrapper.findAll('button').find((b) => b.text().includes('conseil') || b.text().includes('réfléchit'))!
    expect(button().attributes('disabled')).toBeDefined()
    await wrapper.find('textarea').setValue(IDEA)
    await button().trigger('click')
    expect(adviser).toHaveBeenCalledWith(IDEA)
    expect(button().text()).toContain('réfléchit')
    reply({ template: 'vue-node', reason: 'Une petite application suffit.' })
    await flushPromises()
    expect(wrapper.text()).toContain('Conseil d’ADA : Vue 3 + Node.js (Express). Une petite application suffit.')
    expect(await accessibilityViolations(document.body)).toEqual([])
    await next(wrapper)
    expect((wrapper.find('#type-service').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('#template-vue-node').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('label[for="template-vue-node"]').text()).toContain('conseillée par ADA')
    // The PO stays in control.
    await wrapper.find('#template-vue-nest-dsfr').setValue(true)
    await next(wrapper)
    await wrapper.find('input').setValue('Annuaire')
    await next(wrapper)
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ template: 'vue-nest-dsfr' })
    wrapper.unmount()
  })

  it('advice impossible: clear message, the PO chooses by themselves', async () => {
    const adviser = vi.fn<(idea: string) => Promise<Advice>>(async () => {
      throw new Error('ADA n’a pas pu proposer de stack : choisissez-la vous-même dans la liste.')
    })
    const wrapper = mountComponent(adviser)
    await wrapper.find('textarea').setValue(IDEA)
    await wrapper.findAll('button').find((b) => b.text().includes('conseil'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.fr-error-text').text()).toContain('choisissez-la vous-même')
    await next(wrapper)
    expect((wrapper.find('#type-service').element as HTMLInputElement).checked).toBe(false)
    wrapper.unmount()
  })

  it('server error on a field: back to the step that contains it', async () => {
    const wrapper = mountComponent()
    await goToStacks(wrapper)
    await wrapper.find('#type-maquette').setValue(true)
    await next(wrapper)
    expect(stepTitle(wrapper)).toContain('Nom et présentation')
    await wrapper.setProps({ serverErrors: { idea: 'Idée refusée' } })
    await flushPromises()
    expect(stepTitle(wrapper)).toContain('Votre idée')
    expect(wrapper.text()).toContain('Idée refusée')
    wrapper.unmount()
  })

  it('no accessibility violation at each step, errors included', async () => {
    const wrapper = mountComponent()
    expect(await accessibilityViolations(document.body)).toEqual([])
    await next(wrapper)
    expect(await accessibilityViolations(document.body)).toEqual([])
    await goToStacks(wrapper)
    await next(wrapper)
    expect(await accessibilityViolations(document.body)).toEqual([])
    await wrapper.find('#type-service').setValue(true)
    await wrapper.find('#template-vue-node').setValue(true)
    await next(wrapper)
    await next(wrapper)
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('announces “Je fabrique votre projet” during the creation, and not before', async () => {
    const wrapper = mountComponent()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    await wrapper.setProps({ sendInProgress: true })
    expect(wrapper.find('[role="status"]').text()).toContain('Je fabrique votre projet')
  })
})
