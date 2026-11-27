import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import VueDsfr from '@gouvminint/vue-dsfr'
import DeveloperAssignment from '../DeveloperAssignment.vue'
import { api } from '@/services/api'
import type { StoryDetail } from '@/lib/story'
import { accessibilityViolations } from '@/__tests__/accessibility'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: { read: vi.fn<(filePath: string) => Promise<unknown>>(), send: vi.fn<(filePath: string, body: unknown) => Promise<unknown>>() },
}))
const read = vi.mocked(api.read)
const send = vi.mocked(api.send)

const story = (extra: Partial<StoryDetail> = {}): StoryDetail => ({
  number: 7,
  type: 'story',
  title: 'Rendre un objet',
  status: 'needs-developer',
  createdAt: '',
  closedAt: null,
  url: '',
  ready: true,
  reason: null,
  assignees: [],
  content: null,
  bugContent: null,
  freeContent: null,
  rawText: '',
  messages: [],
  ...extra,
})

const mountComponent = (workRequest: StoryDetail) =>
  mount(DeveloperAssignment, { props: { project: 'pret', story: workRequest }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Assign a developer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('appears only for a blocked (or already assigned) request', () => {
    const inProgress = mountComponent(story({ status: 'in-progress' }))
    expect(inProgress.find('section').exists()).toBe(false)
    inProgress.unmount()
    const blocked = mountComponent(story())
    expect(blocked.find('button').text()).toBe('Assigner un développeur')
    blocked.unmount()
  })

  it('offers the people who have access to the repository, then assigns the chosen one', async () => {
    read.mockResolvedValue([{ login: 'dev-a', avatar: null }, { login: 'dev-b', avatar: null }])
    send.mockResolvedValue(story({ assignees: [{ login: 'dev-b', avatar: null }] }))
    const wrapper = mountComponent(story())
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(read).toHaveBeenCalledWith('/projects/pret/stories/developers')
    const options = wrapper.findAll('option').map((option) => option.text())
    expect(options).toEqual(['Choisir un développeur', 'dev-a', 'dev-b'])
    expect(await accessibilityViolations(document.body)).toEqual([])
    await wrapper.find('select').setValue('dev-b')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/pret/stories/7/assign', { login: 'dev-b' })
    wrapper.unmount()
  })

  it('displays the assigned developer, and lets the assignment be changed or removed', async () => {
    send.mockResolvedValue(story())
    const wrapper = mountComponent(story({ assignees: [{ login: 'dev-a', avatar: null }] }))
    expect(wrapper.find('[role="status"]').text()).toBe('Assignée à dev-a sur GitHub.')
    const buttons = wrapper.findAll('button').map((button) => button.text())
    expect(buttons).toEqual(['Changer de développeur', 'Retirer l’assignation'])
    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/pret/stories/7/assign', { login: null })
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})
