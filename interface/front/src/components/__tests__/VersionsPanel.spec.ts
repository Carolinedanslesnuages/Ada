import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import VersionsPanel from '../VersionsPanel.vue'
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

const proposed = (publishable: boolean, reason: string | null = null) => ({
  current: null,
  proposed: {
    version: '0.2.0',
    pullRequestNumber: 4,
    url: 'u',
    features: [{ text: 'Page d’accueil', workRequest: 1 }],
    fixes: [],
    others: [],
    publishable,
    reason,
  },
})

const mountComponent = async () => {
  const wrapper = mount(VersionsPanel, { props: { project: 'poc' }, global: { plugins: [VueDsfr] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const button = (wrapper: Awaited<ReturnType<typeof mountComponent>>, text: string) =>
  wrapper.findAll('button').find((b) => b.text().includes(text))!

describe('Project versions', () => {
  beforeEach(() => {
    read.mockReset()
    send.mockReset()
  })

  it('shows the summary of the new version, then publishes it', async () => {
    read.mockResolvedValue(proposed(true))
    send.mockResolvedValue({ current: { version: '0.2.0', url: 'u', at: null }, proposed: null })
    const wrapper = await mountComponent()
    expect(wrapper.text()).toContain('aucune version publiée')
    await button(wrapper, 'Nouvelle version prête : 0.2.0').trigger('click')
    expect(wrapper.text()).toContain('Page d’accueil (story #1)')
    expect(wrapper.text()).toContain('Rien n’est mis en production')
    expect(await accessibilityViolations(document.body)).toEqual([])
    await button(wrapper, 'Publier la version 0.2.0').trigger('click')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/poc/versions/publish', {})
    expect(wrapper.text()).toContain('La version 0.2.0 est publiée')
    wrapper.unmount()
  })

  it('prevents the publication when the version touches code, and says why', async () => {
    read.mockResolvedValue(proposed(false, 'La version proposée modifie aussi d’autres fichiers (app.ts)'))
    const wrapper = await mountComponent()
    await button(wrapper, 'Nouvelle version prête').trigger('click')
    expect(button(wrapper, 'Publier la version').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('modifie aussi d’autres fichiers')
    wrapper.unmount()
  })
})
