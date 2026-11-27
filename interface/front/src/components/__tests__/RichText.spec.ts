import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RichText from '../RichText.vue'
import { accessibilityViolations } from '@/__tests__/accessibility'

describe('Rich text (ADA\'s messages)', () => {
  it('displays bold, lists and subheadings without asterisks, and escapes all HTML', async () => {
    const wrapper = mount(RichText, {
      props: { text: '**Accessibilité**\n- un **titre** de page\n- <script>alert(1)</script>' },
      attachTo: document.body,
    })
    expect(wrapper.text()).not.toContain('**')
    expect(wrapper.find('p.fr-text--bold').text()).toBe('Accessibilité')
    expect(wrapper.findAll('ul li')).toHaveLength(2)
    expect(wrapper.find('li strong').text()).toBe('titre')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
    expect(wrapper.find('h1, h2, h3, h4, h5, h6').exists()).toBe(false)
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})
