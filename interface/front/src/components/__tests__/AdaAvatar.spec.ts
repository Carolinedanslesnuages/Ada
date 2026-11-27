import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AdaAvatar from '../AdaAvatar.vue'
import { accessibilityViolations } from '@/__tests__/accessibility'

describe('ADA\'s avatar', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('one click freezes it, another restarts it; the button says what it does', async () => {
    const wrapper = mount(AdaAvatar, { props: { phase: 'implementation' }, attachTo: document.body })
    const button = wrapper.get('button')
    expect(button.text()).toContain('ADA réalise…')
    expect(button.text()).toContain('arrêter l’animation')
    expect(button.classes()).not.toContain('ada-avatar--still')
    expect(await accessibilityViolations(document.body)).toEqual([])

    await button.trigger('click')
    expect(button.classes()).toContain('ada-avatar--still')
    expect(button.text()).toContain('relancer l’animation')
    expect(button.attributes('title')).toBe('Relancer l’animation')

    await button.trigger('click')
    expect(button.classes()).not.toContain('ada-avatar--still')
    wrapper.unmount()
  })

  it('without available storage, the button still works for the visit', async () => {
    vi.stubGlobal('localStorage', undefined)
    const wrapper = mount(AdaAvatar)
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('button').classes()).toContain('ada-avatar--still')
    wrapper.unmount()
  })

  it('remembers the choice from one visit to the next', async () => {
    const first = mount(AdaAvatar)
    await first.get('button').trigger('click')
    first.unmount()
    const second = mount(AdaAvatar)
    expect(second.get('button').classes()).toContain('ada-avatar--still')
    second.unmount()
  })
})
