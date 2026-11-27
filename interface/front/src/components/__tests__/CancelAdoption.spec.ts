import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import CancelAdoption from '../CancelAdoption.vue'
import { api } from '@/services/api'
import type { Project } from '@/stores/projects'
import { accessibilityViolations } from '@/__tests__/accessibility'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: {
    read: vi.fn<(filePath: string) => Promise<unknown>>(),
    send: vi.fn<(filePath: string, body: unknown) => Promise<unknown>>(),
  },
}))
const send = vi.mocked(api.send)

const project = (extra: Partial<Project>): Project => ({
  id: 'un-po~mon-poc',
  name: 'mon-poc',
  owner: 'un-po',
  account: 'personal',
  adoption: null,
  adopted: true,
  description: null,
  isPrivate: true,
  url: 'https://github.com/un-po/mon-poc',
  updatedAt: null,
  ...extra,
})
const mountComponent = (value: Project) => mount(CancelAdoption, { props: { project: value }, global: { plugins: [VueDsfr] }, attachTo: document.body })
const button = (wrapper: ReturnType<typeof mountComponent>, text: string) => wrapper.findAll('button').find((element) => element.text().startsWith(text))

describe('Cancel an adoption / unlink an adopted project', () => {
  beforeEach(() => send.mockReset())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('pending adoption: asks for confirmation, explains, then cancels', async () => {
    send.mockResolvedValue({ state: 'cancelled' })
    const wrapper = mountComponent(project({ adoption: { pullRequest: 'https://github.com/un-po/mon-poc/pull/3' } }))
    await button(wrapper, 'Annuler la reprise')!.trigger('click')
    expect(wrapper.text()).toContain('Le projet n’a jamais été modifié')
    expect(send).not.toHaveBeenCalled()
    expect(await accessibilityViolations(document.body)).toEqual([])
    await button(wrapper, 'Confirmer l’annulation')!.trigger('click')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/un-po~mon-poc/adoption/cancel', {})
    expect(wrapper.emitted('done')).toEqual([['cancelled']])
    wrapper.unmount()
  })

  it('project in ADA (adopted or created by it): “Retirer d’ADA”, nothing is deleted on GitHub', async () => {
    send.mockResolvedValue({ state: 'unlinked' })
    const wrapper = mountComponent(project({}))
    await button(wrapper, 'Retirer d’ADA')!.trigger('click')
    expect(wrapper.text()).toContain('rien n’est supprimé sur GitHub')
    await button(wrapper, 'Confirmer le retrait')!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('done')).toEqual([['unlinked']])
    wrapper.unmount()
  })

  it('“Keep the project in ADA” does nothing', async () => {
    const wrapper = mountComponent(project({}))
    await button(wrapper, 'Retirer d’ADA')!.trigger('click')
    await button(wrapper, 'Garder le projet dans ADA')!.trigger('click')
    expect(send).not.toHaveBeenCalled()
    expect(button(wrapper, 'Retirer d’ADA')).toBeDefined()
    wrapper.unmount()
  })
})
