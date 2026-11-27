import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import StoryList from '../StoryList.vue'
import type { StorySummary } from '@/lib/story'
import { accessibilityViolations } from '@/__tests__/accessibility'

const story = (number: number, status: StorySummary['status'], title: string, others: Partial<StorySummary> = {}): StorySummary => ({
  number, type: 'story', title, status, createdAt: '', closedAt: null, url: '', ready: true, reason: null, ...others,
})
const stories: StorySummary[] = [
  story(2, 'in-progress', 'Filtre visio', { type: 'bug' }),
  story(1, 'delivered', 'Salles libres'),
  story(3, 'new', 'Trop grosse', { ready: false, reason: 'Plus de 4 critères' }),
  story(4, 'new', 'Réserver une salle'),
]

const mountComponent = (currentNumber: number | null = null) =>
  mount(StoryList, { props: { stories, currentNumber }, global: { plugins: [VueDsfr] }, attachTo: document.body })

const storyButton = (wrapper: ReturnType<typeof mountComponent>, number: number) =>
  wrapper.findAll('button').find((button) => button.text().includes(`#${number}`))

describe('Story list', () => {
  it('highlights the open story and asks to open on click', async () => {
    const wrapper = mountComponent(1)
    expect(storyButton(wrapper, 1)!.attributes('aria-current')).toBe('true')
    expect(storyButton(wrapper, 2)!.attributes('aria-current')).toBeUndefined()
    expect(wrapper.text()).toContain('Livrée')
    expect(storyButton(wrapper, 2)!.text()).toContain('Problème')
    await storyButton(wrapper, 2)!.trigger('click')
    expect(wrapper.emitted('open')?.[0]).toEqual([2])
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('puts the stories to launch in a closed accordion, with their count; the ones in progress stay visible', async () => {
    const wrapper = mountComponent()
    const accordion = wrapper.find('button[aria-controls="stories-to-launch"]')
    expect(accordion.text()).toContain('À lancer (2)')
    expect(accordion.attributes('aria-expanded')).toBe('false')
    expect(storyButton(wrapper, 2)!.isVisible()).toBe(true)
    await accordion.trigger('click')
    expect(accordion.attributes('aria-expanded')).toBe('true')
    expect(storyButton(wrapper, 3)!.text()).toContain('À corriger sur GitHub')
    await storyButton(wrapper, 4)!.trigger('click')
    expect(wrapper.emitted('open')?.[0]).toEqual([4])
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('automatically opens the accordion when the displayed story is to be launched', () => {
    const wrapper = mountComponent(4)
    expect(wrapper.find('button[aria-controls="stories-to-launch"]').attributes('aria-expanded')).toBe('true')
    expect(storyButton(wrapper, 4)!.attributes('aria-current')).toBe('true')
    wrapper.unmount()
  })

  it('without a story to launch, no accordion', () => {
    const wrapper = mount(StoryList, { props: { stories: [stories[0]!] }, global: { plugins: [VueDsfr] } })
    expect(wrapper.find('button[aria-controls="stories-to-launch"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('puts a request on hold at the end of the stories to launch, never advised', async () => {
    const list: StorySummary[] = [story(2, 'waiting', 'Mode essai'), story(5, 'new', 'Envoyer')]
    const wrapper = mount(StoryList, { props: { stories: list }, global: { plugins: [VueDsfr] }, attachTo: document.body })
    expect(wrapper.find('.next-story').text()).toContain('#5')
    expect(wrapper.find('ul[aria-label="Stories en cours"]').exists()).toBe(false)
    await wrapper.find('button[aria-controls="stories-to-launch"]').trigger('click')
    const lines = wrapper.findAll('ol.story-list > li')
    expect(lines.map((element) => Number(/#(\d+)/.exec(element.text())![1]))).toEqual([5, 2])
    expect(lines[1]!.text()).toContain('En attente')
    wrapper.unmount()
  })

  it('advises the next story and orders the ones to launch in the advised order', async () => {
    const toOrder: StorySummary[] = [
      story(9, 'new', 'Récente, sans découpage'),
      story(7, 'new', 'Envoyer les e-mails', { parent: 4 }),
      story(6, 'new', 'Socle du site', { parent: 4 }),
      story(3, 'new', 'À corriger', { ready: false, reason: 'Plus de 4 critères' }),
      story(8, 'new', 'Bouton cassé', { type: 'bug' }),
    ]
    const wrapper = mount(StoryList, { props: { stories: toOrder }, global: { plugins: [VueDsfr] }, attachTo: document.body })
    const advice = wrapper.find('.next-story')
    expect(advice.text()).toContain('Prochaine story conseillée')
    expect(advice.text()).toContain('#8')
    await wrapper.find('button[aria-controls="stories-to-launch"]').trigger('click')
    const order = wrapper.findAll('ol.story-list > li').map((element) => Number(/#(\d+)/.exec(element.text())![1]))
    expect(order).toEqual([8, 6, 7, 9, 3])
    await advice.find('button').trigger('click')
    expect(wrapper.emitted('open')?.[0]).toEqual([8])
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})
