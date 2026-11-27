import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import DictateButton from '../DictateButton.vue'
import AdaConversation from '../AdaConversation.vue'
import PromptForm from '../PromptForm.vue'
import { accessibilityViolations } from '@/__tests__/accessibility'
import type { StoryDetail } from '@/lib/story'

/** Fake speech recognition: the test “says” a sentence, or triggers an error. */
class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = true
  onresult: ((event: { resultIndex: number; results: unknown[] }) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  started = false
  constructor() {
    FakeRecognition.last = this
  }
  start() {
    this.started = true
  }
  stop() {
    this.onend?.()
  }
  say(phrase: string, final = true) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: phrase }], { isFinal: final })] })
  }
}

describe('Dictation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('absent when the browser does not offer speech recognition (Firefox)', () => {
    const wrapper = mount(DictateButton, { props: { field: 'x' }, global: { plugins: [VueDsfr] } })
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('listens in French, passes on each recognized sentence, then stops', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    document.body.insertAdjacentHTML('beforeend', '<label for="message">Message</label><textarea id="message"></textarea>')
    const wrapper = mount(DictateButton, { props: { field: 'message' }, global: { plugins: [VueDsfr] }, attachTo: document.body })
    const button = wrapper.get('button')
    expect(button.text()).toBe('Dicter')
    expect(button.attributes('title')).toContain('service de reconnaissance de votre navigateur')
    await button.trigger('click')
    const recognition = FakeRecognition.last!
    expect(recognition.lang).toBe('fr-FR')
    expect(recognition.started).toBe(true)
    expect(button.text()).toBe('Arrêter la dictée')
    expect(wrapper.text()).toContain('Dictée en cours')
    recognition.say('mets le titre', false)
    recognition.say('mets le titre en bleu')
    expect(wrapper.emitted('text')).toEqual([['mets le titre en bleu']])
    expect(await accessibilityViolations(document.body)).toEqual([])
    await button.trigger('click')
    expect(button.text()).toBe('Dicter')
    wrapper.unmount()
  })

  it('says simply why dictation does not work (microphone refused)', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    const wrapper = mount(DictateButton, { props: { field: 'message' }, global: { plugins: [VueDsfr] } })
    await wrapper.get('button').trigger('click')
    FakeRecognition.last!.onerror?.({ error: 'not-allowed' })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Le micro est refusé')
    wrapper.unmount()
  })

  it('in the conversation, the dictated sentence is added to the message', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    const story = { number: 9, type: 'conversation', title: 'Conversation : x', status: 'exchange', createdAt: '', closedAt: null, url: '', ready: true, reason: null, assignees: [], content: null, bugContent: null, freeContent: 'Bonjour', rawText: '', messages: [] } as StoryDetail
    const wrapper = mount(AdaConversation, { props: { story, awaitsAnswer: true }, global: { plugins: [VueDsfr] }, attachTo: document.body })
    await wrapper.find('textarea').setValue('Plutôt')
    await wrapper.findAll('button').find((b) => b.text() === 'Dicter')!.trigger('click')
    FakeRecognition.last!.say('en rouge')
    await wrapper.vm.$nextTick()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Plutôt en rouge')
    expect(wrapper.findAll('button').find((b) => b.text() === 'Arrêter la dictée')!.attributes('aria-controls')).toBe('conversation-message')
    wrapper.unmount()
  })

  it('the field of the guided request carries the identifier that dictation designates', () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    const wrapper = mount(PromptForm, { global: { plugins: [VueDsfr] }, attachTo: document.body })
    expect(document.getElementById('prompt-text')?.tagName).toBe('TEXTAREA')
    wrapper.unmount()
  })
})
