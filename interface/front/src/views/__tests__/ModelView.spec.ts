import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ModelView from '../ModelView.vue'
import { api, ApiError } from '@/services/api'
import { accessibilityViolations } from '@/__tests__/accessibility'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: {
    read: vi.fn<(filePath: string) => Promise<unknown>>(),
    send: vi.fn<(filePath: string, body: unknown) => Promise<unknown>>(),
    replaceWith: vi.fn<(filePath: string, body: unknown) => Promise<unknown>>(),
    remove: vi.fn<(filePath: string) => Promise<unknown>>(),
  },
}))

const EMPTY = { configure: false, address: '', model: '', endKey: null, defaults: 'sonnet' }
const CONFIGURE = { configure: true, address: 'https://llm.exemple.fr/v1', model: 'glm-5', endKey: '…1234', defaults: 'sonnet' }

const mountComponent = async (state: unknown = EMPTY) => {
  vi.mocked(api.read).mockResolvedValue(state)
  const wrapper = mount(ModelView, { global: { plugins: [VueDsfr] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const fill = async (wrapper: Awaited<ReturnType<typeof mountComponent>>) => {
  await wrapper.find('#model-address').setValue('https://llm.exemple.fr/v1')
  await wrapper.find('#model-key').setValue('sk-secret-1234')
  await wrapper.find('#model-name').setValue('glm-5')
}

describe('My model', () => {
  beforeEach(() => vi.clearAllMocks())

  it('announces the default model as long as nothing is filled in', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.text()).toContain('Modèle par défaut d’ADA')
    expect(wrapper.text()).toContain('sonnet')
    expect(wrapper.text()).not.toContain('Revenir au modèle par défaut')
  })

  it('saves address, key and name, then empties the key field without ever displaying it again', async () => {
    vi.mocked(api.replaceWith).mockResolvedValue(CONFIGURE)
    const wrapper = await mountComponent()
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.replaceWith).toHaveBeenCalledWith('/model', { address: 'https://llm.exemple.fr/v1', key: 'sk-secret-1234', model: 'glm-5' })
    expect((wrapper.find('#model-key').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('Votre modèle est utilisé : glm-5')
    expect(wrapper.text()).toContain('…1234')
    expect(wrapper.text()).not.toContain('sk-secret-1234')
  })

  it('shows the server input errors next to the fields', async () => {
    vi.mocked(api.replaceWith).mockRejectedValue(new ApiError(400, 'Erreur 400', { address: 'L’adresse doit commencer par https://.' }))
    const wrapper = await mountComponent()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('L’adresse doit commencer par https://.')
  })

  it('tests the connection and says whether the model can call tools', async () => {
    vi.mocked(api.send).mockResolvedValue({ ok: true, toolCalls: false, message: 'Connexion réussie, mais ce modèle n’a pas appelé l’outil demandé.' })
    const wrapper = await mountComponent(CONFIGURE)
    const button = wrapper.findAll('button').find((candidate) => candidate.text().includes('Tester la connexion'))!
    await button.trigger('click')
    await flushPromises()
    expect(api.send).toHaveBeenCalledWith('/model/test', expect.objectContaining({ model: 'glm-5' }))
    expect(wrapper.text()).toContain('n’a pas appelé l’outil demandé')
  })

  it('lets the default model be restored', async () => {
    vi.mocked(api.remove).mockResolvedValue(EMPTY)
    const wrapper = await mountComponent(CONFIGURE)
    await wrapper.findAll('button').find((candidate) => candidate.text().includes('Revenir au modèle par défaut'))!.trigger('click')
    await flushPromises()
    expect(api.remove).toHaveBeenCalledWith('/model')
    expect(wrapper.text()).toContain('Modèle par défaut d’ADA')
  })

  it('follows the accessibility rules', async () => {
    const wrapper = await mountComponent(CONFIGURE)
    expect(await accessibilityViolations(wrapper.element as HTMLElement)).toEqual([])
  })
})
