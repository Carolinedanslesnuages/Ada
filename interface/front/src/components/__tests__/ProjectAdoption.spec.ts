import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import VueDsfr from '@gouvminint/vue-dsfr'
import ProjectAdoption from '../ProjectAdoption.vue'
import { useProjetsStore, type RepositoryToAdopt, type AdoptionResult } from '@/stores/projects'
import type { Template } from '@/lib/project'
import { accessibilityViolations } from '@/__tests__/accessibility'

const TEMPLATES: Template[] = [
  { id: 'vue-node', type: 'service', label: 'Vue + Node, avec DSFR', purpose: 'Un service web complet', available: true, deployable: true },
  { id: 'django', type: 'service', label: 'Django', purpose: 'Pas encore', available: false, deployable: false },
]
const candidate = (id: string, name: string, owner: string, extra: Partial<RepositoryToAdopt> = {}): RepositoryToAdopt => ({
  id,
  name,
  owner,
  account: owner === 'org' ? 'organization' : 'personal',
  description: null,
  url: `https://github.com/${owner}/${name}`,
  adoptionInProgress: null,
  analysisInProgress: false,
  ...extra,
})
const REPOSITORIES = [
  candidate('commun', 'commun', 'org'),
  candidate('un-po~mon-poc', 'mon-poc', 'un-po'),
  candidate('un-po~attente', 'waiting', 'un-po', { adoptionInProgress: 'https://github.com/un-po/attente/pull/2' }),
  candidate('un-po~analyse', 'analysis', 'un-po', { analysisInProgress: true }),
]

describe('Adopt an existing project (#37)', () => {
  let projects: ReturnType<typeof useProjetsStore>
  const toAdopt = vi.fn<() => Promise<RepositoryToAdopt[]>>()
  const adopt = vi.fn<(repository: string, template: string | null, dsfr: boolean) => Promise<AdoptionResult>>()

  const mountComponent = async () => {
    const wrapper = mount(ProjectAdoption, { props: { templates: TEMPLATES }, global: { plugins: [VueDsfr] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const selects = (wrapper: Awaited<ReturnType<typeof mountComponent>>) => wrapper.findAll('select')

  beforeEach(() => {
    setActivePinia(createPinia())
    projects = useProjetsStore()
    toAdopt.mockReset().mockResolvedValue(REPOSITORIES)
    adopt.mockReset().mockResolvedValue({ id: 'un-po~mon-poc', analysis: 'https://github.com/un-po/mon-poc/issues/7', pullRequest: null })
    projects.toAdopt = toAdopt
    projects.adopt = adopt
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists the repositories of the organization and of the PO\'s account; optional stack, without mentioning the DSFR', async () => {
    const wrapper = await mountComponent()
    expect(selects(wrapper)[0]!.findAll('option').map((option) => option.text())).toEqual(
      expect.arrayContaining(['commun (organisation org)', 'mon-poc (votre compte un-po)']),
    )
    await selects(wrapper)[0]!.setValue('commun')
    const stacks = selects(wrapper)[1]!.findAll('option').map((option) => option.text())
    expect(stacks).toContain('Je ne sais pas : ADA la déduit')
    expect(stacks).toContain('Vue + Node')
    expect(stacks).not.toContain('Django')
    wrapper.unmount()
  })

  it('without a stack: launches the analysis and opens the project at once on the analysis request', async () => {
    const wrapper = await mountComponent()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Choisissez le dépôt à reprendre')
    expect(adopt).not.toHaveBeenCalled()

    let reply: (result: AdoptionResult) => void = () => {}
    adopt.mockReturnValue(new Promise((end) => (reply = end)))
    await selects(wrapper)[0]!.setValue('un-po~mon-poc')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('ADA prépare la reprise et lance l’analyse')
    reply({ id: 'un-po~mon-poc', analysis: 'https://github.com/un-po/mon-poc/issues/7', pullRequest: null })
    await flushPromises()
    expect(adopt).toHaveBeenCalledWith('un-po~mon-poc', null, false)
    expect(wrapper.emitted('launched')).toEqual([['un-po~mon-poc', 7]])
    wrapper.unmount()
  })

  it('error at launch: explained, without leaving the form', async () => {
    adopt.mockRejectedValue(new Error('Seul un administrateur de ce dépôt peut le faire reprendre par ADA.'))
    const wrapper = await mountComponent()
    await selects(wrapper)[0]!.setValue('un-po~mon-poc')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Seul un administrateur')
    expect(wrapper.emitted('launched')).toBeUndefined()
    wrapper.unmount()
  })

  it('with a stack and the DSFR chosen', async () => {
    const wrapper = await mountComponent()
    await selects(wrapper)[0]!.setValue('commun')
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios.map((radio) => (radio.element as HTMLInputElement).checked)).toEqual([true, false])
    await selects(wrapper)[1]!.setValue('vue-node')
    await radios[1]!.trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(adopt).toHaveBeenCalledWith('commun', 'vue-node', true)
    wrapper.unmount()
  })

  it('adoption already proposed or analysis in progress: no new request', async () => {
    const wrapper = await mountComponent()
    await selects(wrapper)[0]!.setValue('un-po~attente')
    expect(wrapper.find('a[href="https://github.com/un-po/attente/pull/2"]').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    await selects(wrapper)[0]!.setValue('un-po~analyse')
    expect(wrapper.text()).toContain('ADA analyse déjà ce projet')
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('is accessible', async () => {
    const wrapper = await mountComponent()
    await selects(wrapper)[0]!.setValue('commun')
    expect(await accessibilityViolations(wrapper.element)).toEqual([])
    wrapper.unmount()
  })
})
