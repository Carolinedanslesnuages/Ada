import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import DeliveredStories from '../DeliveredStories.vue'
import type { StorySummary } from '@/lib/story'
import { accessibilityViolations } from '@/__tests__/accessibility'

const delivered = (number: number): StorySummary => ({
  number,
  type: 'story',
  title: `Story ${number}`,
  status: 'delivered',
  createdAt: '2026-11-01T10:00:00Z',
  closedAt: '2026-11-16T10:00:00Z',
  url: '',
  ready: true,
  reason: null,
})

const mountComponent = (count: number) =>
  mount(DeliveredStories, {
    props: { stories: Array.from({ length: count }, (_, rank) => delivered(count - rank)), repositoryUrl: 'https://github.com/proprio/poc' },
    global: { plugins: [VueDsfr] },
    attachTo: document.body,
  })

describe('“Déjà livrées” section', () => {
  it('is collapsed by default and announces the number of delivered stories', () => {
    const wrapper = mountComponent(3)
    const button = wrapper.find('button[aria-expanded]')
    expect(button.text()).toBe('Déjà livrées (3)')
    expect(button.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('shows at most the last 10, and a link to every closed issue on GitHub', async () => {
    const wrapper = mountComponent(12)
    await wrapper.find('button[aria-expanded]').trigger('click')
    expect(wrapper.findAll('ul[aria-label="Stories déjà livrées"] li')).toHaveLength(10)
    expect(wrapper.text()).toContain('Les 10 dernières livrées.')
    const link = wrapper.find('a[href*="/issues?q="]')
    expect(link.attributes('href')).toBe('https://github.com/proprio/poc/issues?q=is%3Aissue%20is%3Aclosed')
    expect(link.text()).toContain('Voir tout sur GitHub')
    wrapper.unmount()
  })

  it('opens a delivered story on click', async () => {
    const wrapper = mountComponent(2)
    await wrapper.find('button[aria-expanded]').trigger('click')
    await wrapper.find('ul[aria-label="Stories déjà livrées"] button').trigger('click')
    expect(wrapper.emitted('open')).toEqual([[2]])
    wrapper.unmount()
  })

  it('no automatic accessibility violation, collapsed as well as expanded', async () => {
    const wrapper = mountComponent(2)
    expect(await accessibilityViolations(document.body)).toEqual([])
    await wrapper.find('button[aria-expanded]').trigger('click')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})
