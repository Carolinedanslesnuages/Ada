import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import PromptForm from '../PromptForm.vue'
import { accessibilityViolations } from '@/__tests__/accessibility'

const mountComponent = () => mount(PromptForm, { global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Prompt (free mode)', () => {
  it('explains that it is for a small change, not a whole application, with a plan to approve', async () => {
    const wrapper = mountComponent()
    expect(wrapper.text()).toContain('Pas une application entière')
    expect(wrapper.text()).toContain('En envoyant, votre texte est enregistré tel quel sur GitHub, comme une demande « mode libre » du projet')
    const send = wrapper.findAll('button').find((b) => b.text().includes('Envoyer'))!
    expect(send.attributes('aria-describedby')).toBe('prompt-saving')
    expect(wrapper.text()).toContain('plan à valider')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('sends the cleaned request', async () => {
    const wrapper = mountComponent()
    await wrapper.find('textarea').setValue('  Mets le titre en bleu  ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]).toEqual(['Mets le titre en bleu'])
    wrapper.unmount()
  })

  it('refuses an empty or oversized request', async () => {
    const wrapper = mountComponent()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Décrivez votre demande')
    await wrapper.find('textarea').setValue('x'.repeat(1001))
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('écrivez des stories')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})
