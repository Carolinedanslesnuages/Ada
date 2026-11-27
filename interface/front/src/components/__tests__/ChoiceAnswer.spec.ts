import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ChoiceAnswer from '../ChoiceAnswer.vue'
import type { ChoiceQuestion } from '@/lib/story'
import { accessibilityViolations } from '@/__tests__/accessibility'

const QUESTIONS: ChoiceQuestion[] = [
  { question: 'Retour le jour même ?', choice: ['Oui', 'Non'], several: false },
  { question: 'Quelles colonnes afficher ?', choice: ['Nom', 'Date', 'Emprunteur'], several: true },
]
const mountComponent = () => mount(ChoiceAnswer, { props: { questions: QUESTIONS }, global: { plugins: [VueDsfr] }, attachTo: document.body })
const click = async (wrapper: ReturnType<typeof mountComponent>, text: string, rank: number) => {
  const tag = wrapper.findAll('label').find((element) => element.text().startsWith(text) && element.attributes('for')?.startsWith(`choice-${rank}-`))!
  await wrapper.find(`#${tag.attributes('for')}`).trigger('click')
}

describe('Answer by ticking', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('radio buttons for a single answer, checkboxes for several, and one clarification per question', () => {
    const wrapper = mountComponent()
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2)
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(3)
    expect(wrapper.text()).toContain('(plusieurs réponses possibles)')
    expect(wrapper.text()).toContain('Autre / précision pour la question 1 (facultatif)')
    wrapper.unmount()
  })

  it('asks for an answer to each question (a box or a clarification)', async () => {
    const wrapper = mountComponent()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('reply')).toBeUndefined()
    expect(wrapper.text()).toContain('Cochez une réponse, ou écrivez une précision')
    wrapper.unmount()
  })

  it('sends the ticked options and the clarification, as readable text', async () => {
    const wrapper = mountComponent()
    await click(wrapper, 'Non', 0)
    await click(wrapper, 'Nom', 1)
    await click(wrapper, 'Emprunteur', 1)
    const fields = wrapper.findAll('input[type="text"], input:not([type])')
    await fields[fields.length - 1]!.setValue('seulement sur ordinateur')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('reply')?.[0]).toEqual([
      '1. Retour le jour même ?\n→ Non\n\n2. Quelles colonnes afficher ?\n→ Nom ; Emprunteur\nPrécision : seulement sur ordinateur',
    ])
    wrapper.unmount()
  })

  it('a clarification alone is enough to answer a question', async () => {
    const wrapper = mountComponent()
    const fields = wrapper.findAll('input[type="text"], input:not([type])')
    await fields[0]!.setValue('ça dépend du matériel')
    await click(wrapper, 'Date', 1)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('reply')?.[0]?.[0]).toContain('1. Retour le jour même ?\nPrécision : ça dépend du matériel')
    wrapper.unmount()
  })

  it('no automatic accessibility violation, displayed errors included', async () => {
    const wrapper = mountComponent()
    expect(await accessibilityViolations(document.body)).toEqual([])
    await wrapper.find('form').trigger('submit')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('does not repeat the number already written by ADA (“1. 1.”)', () => {
    const wrapper = mount(ChoiceAnswer, {
      props: { questions: [{ question: '1. Les résolus restent-ils affichés ?', choice: ['Oui', 'Non'], several: false }] },
      global: { plugins: [VueDsfr] },
    })
    expect(wrapper.text()).toContain('1. Les résolus restent-ils affichés ?')
    expect(wrapper.text()).not.toContain('1. 1.')
    wrapper.unmount()
  })
})
