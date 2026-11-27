import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import AdaConversation from '../AdaConversation.vue'
import { accessibilityViolations } from '@/__tests__/accessibility'
import type { StoryDetail, ProposedStory } from '@/lib/story'

const conversation: StoryDetail = {
  number: 9,
  type: 'conversation',
  title: 'Conversation : mets le titre en bleu',
  status: 'exchange',
  createdAt: '2026-11-18T10:00:00Z',
  closedAt: null,
  url: 'https://github.com/po/poc/issues/9',
  ready: true,
  reason: null,
  assignees: [],
  content: null,
  bugContent: null,
  freeContent: 'Mets le titre en bleu',
  rawText: '',
  messages: [
    { id: 1, author: 'po1', avatar: null, text: '▶️ Lancée depuis ADA par po1 (conversation).', at: '2026-11-18T10:00:00Z' },
    { id: 2, author: 'po1', avatar: null, text: '<!-- atelier-po:assistant -->\n🤖 **ADA**\n\nC’est fait : le titre est bleu.', at: '2026-11-18T10:01:00Z' },
  ],
}
const mountComponent = (props: Partial<{ awaitsAnswer: boolean; story: StoryDetail }> = {}) =>
  mount(AdaConversation, { props: { story: conversation, awaitsAnswer: true, ...props }, global: { plugins: [VueDsfr] }, attachTo: document.body })
const button = (wrapper: ReturnType<typeof mountComponent>, label: string) => wrapper.findAll('button').find((b) => b.text().includes(label))

describe('Conversation with ADA', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows every exchange in order, without the launch comment', async () => {
    const wrapper = mountComponent()
    const messages = wrapper.findAll('ol.conversation > li').map((li) => li.text())
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain('Vous')
    expect(messages[0]).toContain('Mets le titre en bleu')
    expect(messages[1]).toContain('ADA')
    expect(messages[1]).toContain('C’est fait : le titre est bleu.')
    expect(wrapper.text()).not.toContain('Lancée depuis ADA')
    expect(messages[1]).not.toContain('🤖')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('sends the next message; refuses an empty message', async () => {
    const wrapper = mountComponent()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Écrivez votre message à ADA')
    expect(wrapper.emitted('send')).toBeUndefined()
    await wrapper.find('textarea').setValue('  plutôt en rouge ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('send')).toEqual([['plutôt en rouge']])
    wrapper.unmount()
  })

  it('“all good” proposes the changes; stopping asks for confirmation', async () => {
    const wrapper = mountComponent()
    await button(wrapper, 'C’est bon : proposer ces changements')!.trigger('click')
    expect(wrapper.emitted('finish')).toHaveLength(1)
    await button(wrapper, 'Arrêter la conversation')!.trigger('click')
    expect(wrapper.emitted('stop')).toBeUndefined()
    expect(wrapper.text()).toContain('Rien de ce qu’ADA a fait ne sera ajouté au projet')
    expect(await accessibilityViolations(document.body)).toEqual([])
    await button(wrapper, 'Oui, arrêter')!.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
    wrapper.unmount()
  })

  it('while ADA is working: no field or button', () => {
    const wrapper = mountComponent({ awaitsAnswer: false })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
    wrapper.unmount()
  })
  describe('stories for later proposed by ADA', () => {
    const proposed: ProposedStory = { title: 'Envoyer les tirages', role: 'organisateur', need: 'envoyer les tirages par e-mail', benefit: 'prévenir chacun', criteria: ['Un e-mail par participant'] }
    const data = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([proposed]))))
    const withProposal = (next: StoryDetail['messages'] = []): StoryDetail => ({
      ...conversation,
      messages: [
        ...conversation.messages,
        { id: 3, author: 'po1', avatar: null, text: `<!-- atelier-po:assistant -->\n🤖 **ADA**\n\nVoici une story pour plus tard.\n\n<!-- ada:decoupage ${data} -->`, at: '2026-11-18T10:02:00Z' },
        ...next,
      ],
    })

    it('are chosen in the conversation, ADA publishes them; no “other breakdown” (the PO answers ADA)', async () => {
      const wrapper = mountComponent({ story: withProposal() })
      expect(wrapper.text()).toContain('Stories proposées')
      expect(wrapper.text()).toContain('Envoyer les tirages')
      expect(wrapper.text()).toContain('reliées à la conversation n° 9')
      expect(button(wrapper, 'Demander un autre découpage')).toBeUndefined()
      expect(button(wrapper, 'Publier la story sur GitHub')).toBeDefined()
      await wrapper.findAll('form')[0]!.trigger('submit') // the stories form, before the message area
      expect(wrapper.emitted('createStories')?.[0]?.[0]).toEqual([proposed])
      expect(await accessibilityViolations(document.body)).toEqual([])
      wrapper.unmount()
    })

    it('disappear once published (a message follows them), and while ADA is working', () => {
      const published = mountComponent({ story: withProposal([{ id: 4, author: 'po1', avatar: null, text: '📝 Stories publiées par po1 : #12.', at: '2026-11-18T10:03:00Z' }]) })
      expect(published.text()).not.toContain('Stories proposées')
      published.unmount()
      const busy = mountComponent({ story: withProposal(), awaitsAnswer: false })
      expect(busy.text()).not.toContain('Stories proposées')
      busy.unmount()
    })
  })
})
