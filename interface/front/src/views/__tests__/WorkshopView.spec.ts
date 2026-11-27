import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import VueDsfr from '@gouvminint/vue-dsfr'
import WorkshopView from '../WorkshopView.vue'
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

const story = { number: 1, type: 'story', title: 'Page d’accueil', status: 'new', createdAt: '', url: '', ready: true, reason: null }

const answers: Record<string, unknown> = {
  '/projects': [
    { id: 'poc-portail', name: 'poc-portail', owner: 'p', account: 'organization' as const, adoption: null, adopted: false, description: null, isPrivate: true, url: 'https://github.com/p/poc-portail', updatedAt: null },
    { id: 'annuaire', name: 'annuaire', owner: 'p', account: 'organization' as const, adoption: null, adopted: false, description: null, isPrivate: true, url: 'https://github.com/p/annuaire', updatedAt: null },
  ],
  '/projects/poc-portail/stories': [story],
  '/projects/annuaire/stories': [],
  '/projects/poc-portail/preview': { state: 'starting', url: null, log: null },
  '/projects/poc-portail/versions': { current: null, proposed: null },
  '/projects/annuaire/versions': { current: null, proposed: null },
}

/** Chooses a project in the sidebar. */
const choose = async (wrapper: ReturnType<typeof mount>, project: string) => {
  await wrapper.findAll('nav[aria-label="Projets et demandes"] ul[aria-label="Vos projets"] button').find((button) => button.text().includes(project))!.trigger('click')
  await flushPromises()
}
const button = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((b) => b.text().includes(text) || b.attributes('title') === text || b.attributes('aria-label') === text)

/** Mounts the workshop; no project is open on arrival: `project` is chosen in the sidebar. */
const mountComponent = async (project: string | null = 'poc-portail') => {
  const wrapper = mount(WorkshopView, { global: { plugins: [VueDsfr] }, attachTo: document.body })
  await flushPromises()
  if (project) await choose(wrapper, project)
  return wrapper
}

describe('Workshop screen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    read.mockReset()
    send.mockReset()
    read.mockImplementation(async (filePath: string) => answers[filePath])
    send.mockResolvedValue({ state: 'starting', url: null, log: null })
  })

  it('on arrival, no project is open: the PO chooses it in the sidebar', async () => {
    const wrapper = await mountComponent(null)
    expect(wrapper.text()).toContain('Choisissez un projet dans la barre de gauche.')
    expect(wrapper.findAll('ul[aria-label="Vos projets"] button').map((b) => b.text())).toEqual(expect.arrayContaining(['poc-portail', 'annuaire']))
    expect(send).not.toHaveBeenCalledWith('/projects/poc-portail/preview', {})
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('an open project: its requests in the sidebar, the “Que fait-on ?” home in the center, the preview starting', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('ul[aria-label="Vos projets"] button[aria-current="true"]').text()).toBe('poc-portail')
    expect(wrapper.find('nav').text()).toContain('Page d’accueil')
    expect(wrapper.find('#home-title').text()).toBe('Que fait-on sur poc-portail ?')
    expect(wrapper.text()).toContain('Story conseillée : #1 Page d’accueil')
    expect(wrapper.text()).toContain('Préparation de l’aperçu de « poc-portail »')
    expect(send).toHaveBeenCalledWith('/projects/poc-portail/preview', {})
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('the home opens a conversation with ADA (Enter sends)', async () => {
    const conversation = { ...story, number: 9, type: 'conversation', title: 'Conversation : mets le titre en bleu', status: 'in-progress' }
    send.mockImplementation(async (filePath: string) => (filePath.endsWith('/conversation') ? conversation : { state: 'starting', url: null, log: null }))
    const wrapper = await mountComponent()
    await wrapper.find('#home-message').setValue('Mets le titre en bleu')
    await wrapper.find('#home-message').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/poc-portail/stories/conversation', { text: 'Mets le titre en bleu' })
    wrapper.unmount()
  })

  it('“Hide the project” closes the open project, which stays in the sidebar', async () => {
    const wrapper = await mountComponent()
    await button(wrapper, 'Masquer le projet')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Choisissez un projet dans la barre de gauche.')
    expect(wrapper.findAll('ul[aria-label="Vos projets"] button').map((b) => b.text())).toContain('poc-portail')
    expect(button(wrapper, 'Masquer le projet')).toBeUndefined()
    wrapper.unmount()
  })

  it('a project created by ADA can be removed from ADA, but has no adoption to cancel', async () => {
    const wrapper = await mountComponent()
    expect(button(wrapper, 'Retirer d’ADA')).toBeDefined()
    expect(button(wrapper, 'Annuler la reprise')).toBeUndefined()
    wrapper.unmount()
  })

  it('stories and bugs are written on GitHub, links placed at the bottom of the sidebar', async () => {
    const wrapper = await mountComponent()
    expect(wrapper.find('a[href="https://github.com/p/poc-portail/issues/new?template=user-story.yml"]').exists()).toBe(true)
    expect(wrapper.find('a[href="https://github.com/p/poc-portail/issues/new?template=bug.yml"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('the guided request (with a plan) stays offered as a suggestion', async () => {
    const wrapper = await mountComponent()
    await button(wrapper, 'Demande guidée, avec un plan à valider')!.trigger('click')
    expect(wrapper.find('h2.fr-h4').text()).toBe('Prompter (mode libre)')
    wrapper.unmount()
  })

  it('a request in progress: the home offers to go to it, not to open another', async () => {
    read.mockImplementation(async (filePath: string) =>
      filePath === '/projects/poc-portail/stories' ? [{ ...story, status: 'in-progress' }] : answers[filePath],
    )
    const wrapper = await mountComponent()
    expect(wrapper.find('#home-message').exists()).toBe(false)
    expect(wrapper.text()).toContain('#1 « Page d’accueil » est en cours')
    expect(button(wrapper, 'Y aller')).toBeDefined()
    wrapper.unmount()
  })

  it('“New conversation” goes back to the home, message area ready', async () => {
    const wrapper = await mountComponent()
    await wrapper.findAll('ul.story-list button').find((b) => b.text().includes('Page d’accueil'))?.trigger('click')
    await flushPromises()
    await button(wrapper, 'Nouvelle conversation')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('#home-title').exists()).toBe(true)
    expect(document.activeElement?.id).toBe('home-message')
    wrapper.unmount()
  })

  it('the preview can be enlarged, then back to the conversation (button or Escape)', async () => {
    const wrapper = await mountComponent()
    const panel = () => wrapper.find('#preview-panel').element as HTMLElement
    const center = () => wrapper.find('section[aria-label="Demande en cours"]').element as HTMLElement
    expect(panel().style.display).toBe('none')
    expect(send).toHaveBeenCalledWith('/projects/poc-portail/preview', {})
    await button(wrapper, 'Voir l’aperçu en grand')!.trigger('click')
    await flushPromises()
    expect(panel().style.display).toBe('')
    expect(center().style.display).toBe('none')
    expect(document.activeElement?.id).toBe('preview-title')
    await button(wrapper, 'Revenir à la conversation')!.trigger('click')
    await flushPromises()
    expect(panel().style.display).toBe('none')
    expect(center().style.display).toBe('')
    expect(document.activeElement?.id).toBe('show-preview')
    await button(wrapper, 'Voir l’aperçu en grand')!.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(panel().style.display).toBe('none')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('the ready preview also opens in a tab, from the conversation', async () => {
    read.mockImplementation(async (filePath: string) => answers[filePath])
    send.mockResolvedValue({ state: 'ready', url: 'http://localhost:5301', log: null })
    const wrapper = await mountComponent()
    await flushPromises()
    const link = wrapper.find('.workshop__top a[href="http://localhost:5301"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('target')).toBe('_blank')
    wrapper.unmount()
  })

  it('reads the requests again when “Actualiser” is clicked', async () => {
    const wrapper = await mountComponent()
    read.mockClear()
    await button(wrapper, 'Actualiser')!.trigger('click')
    await flushPromises()
    expect(read).toHaveBeenCalledWith('/projects/poc-portail/stories')
    wrapper.unmount()
  })

  it('reloads the requests when the project changes', async () => {
    const wrapper = await mountComponent()
    await choose(wrapper, 'annuaire')
    expect(read).toHaveBeenCalledWith('/projects/annuaire/stories')
    expect(wrapper.text()).toContain('Aucune demande pour l’instant')
    wrapper.unmount()
  })

  it('offers to create a project when there is none', async () => {
    read.mockImplementation(async (filePath: string) =>
      filePath === '/projects'
        ? []
        : filePath === '/projects/templates'
          ? {
              families: [{ id: 'service', label: 'Un service' }],
              types: [{ id: 'service', family: 'service', label: 'Service en ligne', description: 'Une application' }],
              templates: [{ id: 'vue-nest-dsfr', type: 'service', label: 'Vue 3 + NestJS', purpose: 'Métier', available: true, deployable: false }],
            }
          : undefined,
    )
    const wrapper = await mountComponent(null)
    await wrapper.findAll('button').find((b) => b.text().includes('Nouveau projet'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('h2.fr-h4').text()).toBe('Nouveau projet')
    expect(wrapper.text()).toContain('Votre idée')
    // Nothing to display on the right during the creation: the form is centered.
    expect(wrapper.find('.fr-grid-row--center form').exists()).toBe(true)
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('no automatic accessibility violation', async () => {
    const wrapper = await mountComponent()
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})
