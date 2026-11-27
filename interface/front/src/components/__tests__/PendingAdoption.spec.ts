import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import PendingAdoption from '../PendingAdoption.vue'
import { api } from '@/services/api'
import { accessibilityViolations } from '@/__tests__/accessibility'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: {
    read: vi.fn<(filePath: string) => Promise<unknown>>(),
    send: vi.fn<(filePath: string, body: unknown) => Promise<unknown>>(),
  },
}))
const read = vi.mocked(api.read)
const send = vi.mocked(api.send)

const TITLE = 'Titre de PR (Conventional Commits, semver)'
const inAnalysis = { analysisInProgress: true, pullRequest: null, checks: [], mergeable: false, reason: 'ADA analyse le projet' }
const pr = (mergeable: boolean, state: 'open' | 'merged' = 'open') => ({
  analysisInProgress: false,
  pullRequest: { number: 50, url: 'https://github.com/p/aminimo/pull/50', state },
  checks: [{ name: TITLE, state: mergeable ? 'succeeded' : 'in-progress', link: null }],
  mergeable,
  reason: mergeable ? null : 'Contrôles en cours…',
})

describe('Pending adoption (#37)', () => {
  const mountComponent = async () => {
    const wrapper = mount(PendingAdoption, { props: { project: 'aminimo', pollingInterval: 20 }, global: { plugins: [VueDsfr] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    read.mockReset()
    send.mockReset()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('during the analysis: explains where to follow ADA, without a merge button', async () => {
    read.mockResolvedValue(inAnalysis)
    const wrapper = await mountComponent()
    expect(read).toHaveBeenCalledWith('/projects/aminimo/adoption')
    expect(wrapper.text()).toContain('ADA analyse le projet comme si elle l’avait créé')
    expect(wrapper.text()).not.toContain('Valider et fusionner la reprise')
    wrapper.unmount()
  })

  it('follows the analysis up to the PR, then the PO approves and merges the adoption in ADA', async () => {
    read.mockResolvedValue(inAnalysis)
    const wrapper = await mountComponent()
    read.mockResolvedValue(pr(false))
    await new Promise((end) => setTimeout(end, 40))
    await flushPromises()
    const button = () => wrapper.findAll('button').find((b) => b.text() === 'Valider et fusionner la reprise')!
    expect(button().attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Contrôles en cours…')

    read.mockResolvedValue(pr(true))
    await new Promise((end) => setTimeout(end, 40))
    await flushPromises()
    send.mockResolvedValue(pr(false, 'merged'))
    await button().trigger('click')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/aminimo/adoption/merge', {})
    expect(wrapper.emitted('merged')).toHaveLength(1)
    wrapper.unmount()
  })

  it('check not launched by GitHub: the PO can rerun it from ADA', async () => {
    read.mockResolvedValue({ ...pr(false), checks: [{ name: TITLE, state: 'not-launched', link: null }], reason: 'GitHub n’a pas lancé les contrôles' })
    const wrapper = await mountComponent()
    expect(wrapper.text()).toContain('non lancé par GitHub')
    send.mockResolvedValue(pr(false))
    await wrapper.findAll('button').find((b) => b.text() === 'Relancer les contrôles')!.trigger('click')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/aminimo/adoption/checks/relaunch', {})
    wrapper.unmount()
  })

  it('analysis stopped without a PR: the PO is warned', async () => {
    read.mockResolvedValue({ ...inAnalysis, analysisInProgress: false, reason: 'L’analyse s’est arrêtée sans pull request de reprise' })
    const wrapper = await mountComponent()
    expect(wrapper.text()).toContain('L’analyse s’est arrêtée sans pull request de reprise')
    wrapper.unmount()
  })

  it('is accessible', async () => {
    read.mockResolvedValue(pr(true))
    const wrapper = await mountComponent()
    expect(await accessibilityViolations(wrapper.element)).toEqual([])
    wrapper.unmount()
  })
})
