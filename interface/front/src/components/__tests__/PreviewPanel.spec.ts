import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import PreviewPanel from '../PreviewPanel.vue'
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

const mountComponent = (project: string | null) =>
  mount(PreviewPanel, { props: { project, intervalMs: 1 }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Preview panel', () => {
  beforeEach(() => {
    read.mockReset()
    send.mockReset()
  })

  it('starts the project preview, waits for it to respond, then displays the application', async () => {
    send.mockResolvedValue({ state: 'starting', url: null, log: null })
    read.mockResolvedValueOnce({ state: 'starting', url: null, log: null }).mockResolvedValue({
      state: 'ready',
      url: 'http://localhost:5300',
      log: null,
    })
    const wrapper = mountComponent('poc-portail')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/poc-portail/preview', {})
    expect(wrapper.text()).toContain('Préparation de l’aperçu')
    await vi.waitFor(() => expect(wrapper.find('iframe').exists()).toBe(true))
    const frame = wrapper.find('iframe')
    expect(frame.attributes('src')).toBe('http://localhost:5300')
    expect(frame.attributes('title')).toBe('Aperçu de l’application poc-portail')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('shows the log and offers to retry if the application does not start', async () => {
    send.mockResolvedValue({ state: 'error', url: null, log: 'npm ERR! code 1' })
    const wrapper = mountComponent('poc-portail')
    await flushPromises()
    expect(wrapper.text()).toContain('L’application ne démarre pas')
    expect(wrapper.text()).toContain('npm ERR! code 1')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Réessayer')).toBe(true)
    wrapper.unmount()
  })

  it('adoption to approve: does not try to start, explains why (#37)', () => {
    const wrapper = mount(PreviewPanel, {
      props: { project: 'aminimo', pending: 'L’aperçu démarrera une fois la reprise validée.' },
      global: { plugins: [VueDsfr] },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('L’aperçu démarrera une fois la reprise validée.')
    expect(send).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('gives a sign of life while it is displayed, and restarts if it was put to sleep', async () => {
    vi.useFakeTimers()
    try {
      send.mockResolvedValue({ state: 'ready', url: 'http://localhost:5300', log: null })
      read.mockResolvedValue({ state: 'stopped', url: null, log: null })
      const previewReads = () => read.mock.calls.filter(([filePath]) => filePath === '/projects/poc/preview').length
      const starts = () => send.mock.calls.filter(([filePath]) => filePath === '/projects/poc/preview').length
      const wrapper = mount(PreviewPanel, { props: { project: 'poc', signOfLifeMs: 60_000 }, global: { plugins: [VueDsfr] } })
      await flushPromises()
      expect(starts()).toBe(1)
      expect(previewReads()).toBe(0)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(previewReads()).toBe(1)
      expect(starts()).toBe(2)
      wrapper.unmount()
      const calls = previewReads()
      await vi.advanceTimersByTimeAsync(180_000)
      expect(previewReads()).toBe(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it('invites to choose a project when none is selected', () => {
    const wrapper = mountComponent(null)
    expect(wrapper.text()).toContain('Choisissez un projet')
    expect(send).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
