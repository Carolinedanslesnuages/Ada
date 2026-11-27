import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import DemoLink from '../DemoLink.vue'
import { api } from '@/services/api'
import { accessibilityViolations } from '@/__tests__/accessibility'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: { read: vi.fn<(filePath: string) => Promise<unknown>>(), send: vi.fn<(filePath: string, body: unknown) => Promise<unknown>>() },
}))
const read = vi.mocked(api.read)
const send = vi.mocked(api.send)

const mountComponent = async (isPreviewReady: boolean) => {
  const wrapper = mount(DemoLink, { props: { project: 'pret-de-materiel', isPreviewReady, intervalMs: 0 }, global: { plugins: [VueDsfr] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const button = (wrapper: Awaited<ReturnType<typeof mountComponent>>) => wrapper.find('button')

describe('Demo link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('preview not started: button disabled, and ADA explains why', async () => {
    const wrapper = await mountComponent(false)
    expect(button(wrapper).text()).toBe('Copier le lien de démonstration')
    expect(button(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Disponible quand l’aperçu du projet est démarré.')
    expect(read).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('prepares the demo on demand, then offers to copy the link', async () => {
    read.mockResolvedValueOnce({ state: 'stopped', url: null, isPreviewStarted: true }).mockResolvedValue({ state: 'ready', url: 'https://pret-de-materiel.demo.ada.gouv.fr', isPreviewStarted: true })
    send.mockResolvedValue({ state: 'starting', url: null, isPreviewStarted: true })
    const wrapper = await mountComponent(true)
    expect(button(wrapper).text()).toBe('Préparer le lien de démonstration')
    await button(wrapper).trigger('click')
    await flushPromises()
    await new Promise((end) => setTimeout(end, 5))
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/pret-de-materiel/demo', {})
    expect(button(wrapper).text()).toBe('Copier le lien de démonstration')
    expect(button(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('copies the public link, which shows the last approved version, and announces it', async () => {
    const write = vi.fn<(text: string) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    read.mockResolvedValue({ state: 'ready', url: 'https://pret-de-materiel.demo.ada.gouv.fr', isPreviewStarted: true })
    const wrapper = await mountComponent(true)
    expect(wrapper.text()).toContain('dernière version validée')
    expect(wrapper.find('a[href="https://pret-de-materiel.demo.ada.gouv.fr"]').exists()).toBe(true)
    await button(wrapper).trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalledWith('https://pret-de-materiel.demo.ada.gouv.fr')
    expect(wrapper.find('[role="status"]').text()).toBe('Lien copié : https://pret-de-materiel.demo.ada.gouv.fr')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('no accessibility violation, disabled button included', async () => {
    const wrapper = await mountComponent(false)
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})
