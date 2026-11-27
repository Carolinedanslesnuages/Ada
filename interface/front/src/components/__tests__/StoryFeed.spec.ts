import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import StoryFeed from '../StoryFeed.vue'
import { api } from '@/services/api'
import type { StoryDetail } from '@/lib/story'
import { accessibilityViolations } from '@/__tests__/accessibility'

const story: StoryDetail = {
  number: 12,
  title: 'Voir les salles libres',
  status: 'questions',
  ready: true,
  reason: null,
  createdAt: '2026-11-16T10:00:00Z',
  closedAt: null,
  url: 'https://github.com/proprio/poc/issues/12',
  type: 'story',
  rawText: '',
  assignees: [],
  bugContent: null,
  freeContent: null,
  content: {
    role: "agent d'accueil",
    need: 'voir les salles libres',
    benefit: 'proposer une salle',
    criteria: ['une salle sans réservation en cours est libre'],
  },
  messages: [
    { id: 1, author: 'assistant', avatar: null, text: 'Que veut dire « en ce moment » ?', at: '2026-11-16T10:05:00Z' },
  ],
}

const mountComponent = () =>
  mount(StoryFeed, { props: { story }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Feed of a story', () => {
  const mountWith = (props: Record<string, unknown>) =>
    mount(StoryFeed, {
      props: { story, ...props },
      global: { plugins: [VueDsfr], stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
      attachTo: document.body,
    })
  const button = (wrapper: ReturnType<typeof mountWith>, text: string) =>
    wrapper.findAll('button').find((b) => b.text().includes(text))

  it('asks to write nothing until the story is launched', () => {
    const wrapper = mountWith({ story: { ...story, status: 'new', messages: [] } })
    expect(wrapper.find('textarea').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows that ADA is working, with its last actions, without asking anything', async () => {
    const wrapper = mountWith({
      story: { ...story, status: 'in-progress' },
      activity: {
        phase: 'implementation',
        inProgress: true,
        start: '2026-11-16T14:00:00Z',
        log: [
          { at: '2026-11-16T14:01:00Z', text: 'Lit src/App.vue' },
          { at: '2026-11-16T14:02:00Z', text: 'Lance les tests' },
        ],
        error: null,
        pullRequest: null,
      },
    })
    expect(wrapper.text()).toContain('ADA réalise la demande…')
    expect(wrapper.text()).toContain('ce n’est pas encore terminé')
    expect(wrapper.text()).toContain('Lance les tests')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('warns that comments written directly on GitHub are not read by ADA', async () => {
    const wrapper = mountWith({ story: { ...story, ignoredComments: 2 } })
    expect(wrapper.text()).toContain('2 commentaires ont été écrits directement sur GitHub. ADA ne les lit pas')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
    const one = mountWith({ story: { ...story, ignoredComments: 1 } })
    expect(one.text()).toContain('Un commentaire a été écrit directement sur GitHub. ADA ne le lit pas')
    one.unmount()
    const none = mountWith({ story: { ...story, ignoredComments: 0 } })
    expect(none.text()).not.toContain('directement sur GitHub. ADA ne')
    none.unmount()
  })

  it('signs ADA\'s messages “ADA”, without a technical marker', () => {
    const wrapper = mountWith({
      story: {
        ...story,
        messages: [{ id: 9, author: 'po1', avatar: null, text: '<!-- atelier-po:assistant -->\n🤖 **Plan proposé**\n\nJe vais…', at: '2026-11-16T10:05:00Z' }],
      },
    })
    expect(wrapper.text()).toContain('ADA — ')
    expect(wrapper.text()).not.toContain('atelier-po:assistant')
    wrapper.unmount()
  })

  it('has the plan approved with a button', async () => {
    const wrapper = mountWith({ story: { ...story, status: 'plan-to-approve' } })
    expect(wrapper.find('textarea').exists()).toBe(false)
    await button(wrapper, 'Valider le plan')!.trigger('click')
    expect(wrapper.emitted('validate')).toHaveLength(1)
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('warns that the plan approval and the answers are saved as a GitHub comment', async () => {
    const plan = mountWith({ story: { ...story, status: 'plan-to-approve' } })
    expect(plan.find('#approval-saving').text()).toContain('en commentaire de la story n° 12, à votre nom')
    expect(button(plan, 'Valider le plan')!.attributes('aria-describedby')).toBe('approval-saving')
    plan.unmount()
    const questions = mountWith({})
    expect(questions.find('#answer-saving').text()).toContain('enregistré tel quel sur GitHub, en commentaire de la story n° 12')
    expect(button(questions, 'Envoyer')!.attributes('aria-describedby')).toBe('answer-saving')
    expect(await accessibilityViolations(document.body)).toEqual([])
    questions.unmount()
    const fresh = mountWith({ story: { ...story, status: 'new' } })
    expect(fresh.find('#launch-saving').text()).toContain('un commentaire et le statut de la story n° 12')
    fresh.unmount()
    const bugReport = mountWith({ story: { ...story, type: 'bug', number: 4 } })
    expect(bugReport.find('#answer-saving').text()).toContain('en commentaire du signalement n° 4')
    bugReport.unmount()
  })

  it('explains why the exchanges are saved on GitHub (collapsed by default)', async () => {
    const wrapper = mountWith({})
    const button = wrapper.findAll('button[aria-expanded]').find((element) => element.text().startsWith('Pourquoi'))!
    expect(button.text()).toBe('Pourquoi les échanges sont-ils enregistrés sur GitHub ?')
    expect(button.attributes('aria-expanded')).toBe('false')
    await button.trigger('click')
    expect(wrapper.text()).toContain('Traçabilité')
    expect(wrapper.text()).toContain('commentaires de la story n° 12')
    expect(wrapper.text()).toContain('N’y écrivez donc rien de confidentiel')
    // ADR-0011: what is written on GitHub outside ADA does not reach it.
    expect(wrapper.text()).toContain('ce qui est écrit ou modifié directement sur GitHub ne lui parvient pas')
    expect(wrapper.text()).not.toContain('prochaine lecture')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('choice questions: answer with checkboxes instead of the free field', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify([{ question: 'Retour le jour même ?', choice: ['Oui', 'Non'], several: false }]))
    const text = `<!-- atelier-po:assistant -->\n🤖 **Questions d’ADA**\n\nUne règle.\n\n<!-- ada:choix ${btoa(String.fromCharCode(...bytes))} -->`
    const wrapper = mountWith({ story: { ...story, messages: [...story.messages, { id: 99, author: 'robot', avatar: null, at: '2026-11-16T10:00:00Z', text }] } })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('vos réponses sont enregistrées sur GitHub, en commentaire de la story n° 12')
    await wrapper.find('#choice-0-0').trigger('click')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('reply')?.[0]).toEqual(['1. Retour le jour même ?\n→ Oui'])
    wrapper.unmount()
  })

  it('proposed breakdown: the stories to tick, then their creation requested', async () => {
    const stories = [
      { title: 'Voir', role: 'agent', need: 'voir', benefit: 'savoir', criteria: ['a'] },
      { title: 'Rendre', role: 'agent', need: 'rendre', benefit: 'libérer', criteria: ['b'] },
    ]
    const data = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(stories))))
    const text = `<!-- atelier-po:assistant -->\n🤖 **Découpage proposé**\n\nTrop gros.\n\n<!-- ada:decoupage ${data} -->`
    const wrapper = mountWith({ story: { ...story, status: 'breakdown', messages: [...story.messages, { id: 98, author: 'robot', avatar: null, at: '2026-11-16T10:00:00Z', text }] } })
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('createBreakdown')).toEqual([[stories]])
    await button(wrapper, 'Demander un autre découpage')!.trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.text()).toContain('Ce qu’il faut changer dans le découpage')
    wrapper.unmount()
  })

  it('parent request: its stories, delivered or to do, to open', async () => {
    const wrapper = mountWith({ story: { ...story, status: 'parent', rawText: '### Demande\n\nTout\n\n### Découpage\n\n- [x] #7 Voir\n- [ ] #8 Rendre\n' } })
    expect(wrapper.text()).toContain('Découpée en 2 stories')
    await button(wrapper, '#8 Rendre — à faire')!.trigger('click')
    expect(wrapper.emitted('open')).toEqual([[8]])
    expect(button(wrapper, '#7 Voir — livrée')).toBeDefined()
    wrapper.unmount()
  })

  it('reading order: ADA\'s last message (which explains), then the expected action, the story, and the collapsed history', () => {
    const assistant = (id: number, text: string) => ({ id, author: 'robot', avatar: null, text: `<!-- atelier-po:assistant -->\n${text}`, at: `2026-11-16T10:0${id}:00Z` })
    const wrapper = mountWith({
      story: {
        ...story,
        status: 'plan-to-approve',
        messages: [assistant(1, 'Premières questions'), { id: 2, author: 'po1', avatar: null, text: 'Mes réponses', at: '2026-11-16T10:02:00Z' }, assistant(3, 'Le plan proposé')],
      },
    })
    const titles = wrapper.findAll('h3').map((title) => title.text())
    expect(titles.slice(0, 4)).toEqual(['Dernier message d’ADA', 'À vous de jouer', 'La story', 'Suivi'])
    expect(wrapper.find('.last-message').text()).toContain('Le plan proposé')
    const history = wrapper.findAll('button[aria-expanded]').find((button) => button.text().startsWith('Voir l’historique'))!
    expect(history.text()).toBe('Voir l’historique (2 échanges)')
    expect(history.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.feed').text()).toContain('Premières questions')
    expect(wrapper.find('.feed').text()).not.toContain('Le plan proposé')
    wrapper.unmount()
  })

  it('while ADA is working, the top banner says so (no action requested)', () => {
    const wrapper = mountWith({ story: { ...story, status: 'in-progress' }, activity: { inProgress: true, phase: 'analysis', start: null, log: [], error: null, pullRequest: null } })
    expect(wrapper.find('h3').text()).toBe('ADA travaille')
    expect(wrapper.text()).not.toContain('À vous de jouer')
    // Teleported into the page (outside the scrolling column): it is looked up in the document.
    const avatar = document.querySelector('[data-testid="ada-avatar"]')!
    expect(avatar.textContent).toContain('ADA analyse…')
    expect(wrapper.find('[data-testid="ada-avatar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('lets a change to the plan be requested', async () => {
    const wrapper = mountWith({ story: { ...story, status: 'plan-to-approve' } })
    await button(wrapper, 'Demander une modification')!.trigger('click')
    await wrapper.find('textarea').setValue('Ajouter la météo')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('reply')?.[0]).toEqual(['Ajouter la météo'])
    wrapper.unmount()
  })

  it('asks for an answer when ADA asks questions', async () => {
    const wrapper = mountWith({})
    expect(wrapper.text()).toContain('ADA attend vos réponses')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('reply')).toBeUndefined()
    expect(wrapper.text()).toContain('Écrivez vos réponses')
    await wrapper.find('textarea').setValue('  En toutes lettres.  ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('reply')?.[0]).toEqual(['En toutes lettres.'])
    wrapper.unmount()
  })

  it('conversation: the whole feed is displayed, and the actions go up to the workshop', async () => {
    const wrapper = mountWith({
      story: {
        ...story,
        type: 'conversation',
        status: 'exchange',
        content: null,
        freeContent: 'Mets le titre en bleu',
        messages: [{ id: 5, author: 'po1', avatar: null, text: '<!-- atelier-po:assistant -->\n🤖 **ADA**\n\nC’est fait.', at: '2026-11-18T10:01:00Z' }],
      },
    })
    expect(wrapper.find('#conversation-title').exists()).toBe(true)
    expect(wrapper.find('#last-message-title').exists()).toBe(false)
    await wrapper.find('textarea').setValue('plutôt en rouge')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('sendMessage')).toEqual([['plutôt en rouge']])
    await button(wrapper, 'C’est bon : proposer ces changements')!.trigger('click')
    expect(wrapper.emitted('finishConversation')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the estimated carbon footprint of the request, with its equivalent', async () => {
    const reading = vi.spyOn(api, 'read').mockResolvedValue({
      footprint: { energyWh: { min: 12, max: 29 }, co2Grams: { min: 4.8, max: 11 }, outputTokenCount: 1000, inputTokenCount: 0 },
      equivalents: { streamingHourGrams: 64 },
    })
    const wrapper = mountWith({ project: 'gladys', story: { ...story, status: 'in-progress' } })
    await flushPromises()
    expect(reading).toHaveBeenCalledWith(`/projects/gladys/stories/${story.number}/footprint`)
    expect(wrapper.find('[data-testid="request-footprint"]').text()).toContain('4,8 à 11 g CO2e, soit 4,5 à 10 min de streaming vidéo')
    reading.mockRestore()
    wrapper.unmount()
  })

  it('offers to relaunch ADA on a request in progress where nothing is running', async () => {
    const wrapper = mountWith({
      story: { ...story, status: 'in-progress' },
      activity: { phase: null, inProgress: false, start: null, log: [], error: null, pullRequest: null },
    })
    expect(wrapper.text()).toContain('ADA ne travaille pas sur cette demande en ce moment')
    expect(document.querySelector('[data-testid="ada-avatar"]')).toBeNull()
    await button(wrapper, 'Relancer ADA')!.trigger('click')
    expect(wrapper.emitted('relaunch')).toHaveLength(1)
    wrapper.unmount()
  })

  describe('Review and merge', () => {
    const check = (state: 'succeeded' | 'in-progress' | 'failed' | 'not-launched') => [
      { name: 'Anti-fuite (gitleaks)', state: 'succeeded' as const, link: null },
      { name: 'Front', state, link: null },
    ]
    const verification = (state: 'succeeded' | 'in-progress' | 'failed' | 'not-launched', mergeable: boolean, reason: string | null) => ({
      pullRequest: { number: 3, url: 'https://github.com/p/poc/pull/3', state: 'open' as const },
      checks: check(state),
      mergeable,
      reason,
    })

    it('enables “Valider et fusionner” only if every check succeeded', async () => {
      const wrapper = mountWith({ story: { ...story, status: 'in-review' }, verification: verification('succeeded', true, null) })
      expect(wrapper.text()).toContain('À vous de vérifier')
      expect(wrapper.text()).toContain('Front : réussi')
      const merge = button(wrapper, 'Valider et fusionner')!
      expect(merge.attributes('disabled')).toBeUndefined()
      await merge.trigger('click')
      expect(wrapper.emitted('merge')).toHaveLength(1)
      expect(await accessibilityViolations(document.body)).toEqual([])
      wrapper.unmount()
    })

    it('keeps the button inactive during the checks, and says why', () => {
      const wrapper = mountWith({ story: { ...story, status: 'in-review' }, verification: verification('in-progress', false, 'Contrôles en cours…') })
      expect(button(wrapper, 'Valider et fusionner')!.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Contrôles en cours…')
      expect(wrapper.text()).toContain('Front : en cours')
      expect(button(wrapper, 'Relancer les contrôles')).toBeUndefined()
      wrapper.unmount()
    })

    it('checks not launched by GitHub (billing): the cause is told, the PO can rerun them', async () => {
      const reason = 'GitHub n’a pas lancé les contrôles : … Billing & plans …'
      const wrapper = mountWith({ story: { ...story, status: 'in-review' }, verification: verification('not-launched', false, reason) })
      expect(wrapper.text()).toContain('Front : non lancé par GitHub')
      expect(wrapper.text()).toContain(reason)
      await button(wrapper, 'Relancer les contrôles')!.trigger('click')
      expect(wrapper.emitted('rerunChecks')).toHaveLength(1)
      expect(await accessibilityViolations(document.body)).toEqual([])
      wrapper.unmount()
    })
  })

  it('displays a free request (wild mode)', () => {
    const wrapper = mountWith({ story: { ...story, type: 'free', content: null, freeContent: 'Mets le titre en bleu' } })
    expect(wrapper.text()).toContain('Demande libre (hors story)')
    expect(wrapper.text()).toContain('Mets le titre en bleu')
    expect(wrapper.text()).toContain('Enregistrée sur GitHub comme demande n° 12 « mode libre »')
    wrapper.unmount()
  })

  it('shows the link to the pull request once the implementation is finished', () => {
    const wrapper = mountWith({
      story: { ...story, status: 'in-review' },
      activity: { phase: 'implementation', inProgress: false, start: null, log: [], error: null, pullRequest: 'https://github.com/p/poc/pull/2' },
    })
    expect(wrapper.find('a[href="https://github.com/p/poc/pull/2"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('displays the structured story, its status and the conversation', () => {
    const wrapper = mountComponent()
    expect(wrapper.text()).toContain("En tant que agent d'accueil")
    expect(wrapper.text()).toContain('une salle sans réservation en cours est libre')
    expect(wrapper.text()).toContain('Questions')
    expect(wrapper.text()).toContain('Que veut dire « en ce moment » ?')
    wrapper.unmount()
  })

  it('no automatic accessibility violation', async () => {
    const wrapper = mountComponent()
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
  it('displays a reported bug, without accessibility violation', async () => {
    const wrapper = mount(StoryFeed, {
      props: {
        story: {
          ...story,
          type: 'bug',
          content: null,
          bugContent: {
            observed: 'Aucune salle le lundi',
            expected: 'Les salles libres',
            steps: '1. Ouvrir la liste un lundi',
            screen: '/salles-libres',
          },
        },
      },
      global: { plugins: [VueDsfr] },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('Ce qui se passe')
    expect(wrapper.text()).toContain('Aucune salle le lundi')
    expect(wrapper.text()).toContain('/salles-libres')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
  describe('Launch', () => {
    const fresh = { ...story, status: 'new' as const, messages: [] }

    it('offers to launch a ready story when nothing else is in progress', async () => {
      const wrapper = mount(StoryFeed, { props: { story: fresh }, global: { plugins: [VueDsfr] }, attachTo: document.body })
      const button = wrapper.findAll('button').find((b) => b.text().includes('Lancer cette story'))!
      await button.trigger('click')
      expect(wrapper.emitted('launch')).toHaveLength(1)
      expect(await accessibilityViolations(document.body)).toEqual([])
      wrapper.unmount()
    })

    it('offers to relaunch a request put on hold by ADA', async () => {
      const wrapper = mount(StoryFeed, { props: { story: { ...fresh, status: 'waiting' as const } }, global: { plugins: [VueDsfr] }, attachTo: document.body })
      expect(wrapper.text()).toContain('ADA a mis cette demande en attente')
      const button = wrapper.findAll('button').find((b) => b.text().includes('Relancer cette story'))!
      await button.trigger('click')
      expect(wrapper.emitted('launch')).toHaveLength(1)
      expect(await accessibilityViolations(document.body)).toEqual([])
      wrapper.unmount()
    })

    it('explains that another request is in progress, without a button', () => {
      const wrapper = mount(StoryFeed, {
        props: { story: fresh, otherInProgress: { number: 7, title: 'Accueil' } },
        global: { plugins: [VueDsfr] },
      })
      expect(wrapper.text()).toContain('La demande #7 « Accueil » est en cours : une seule à la fois')
      expect(wrapper.findAll('button').some((b) => b.text().includes('Lancer'))).toBe(false)
    })

    it('asks to fix on GitHub a story that is not ready', () => {
      const wrapper = mount(StoryFeed, {
        props: { story: { ...fresh, ready: false, reason: 'Plus de 4 critères : découpez-la' } },
        global: { plugins: [VueDsfr] },
      })
      expect(wrapper.text()).toContain('À corriger sur GitHub avant de la lancer : Plus de 4 critères')
      expect(wrapper.findAll('button').some((b) => b.text().includes('Lancer'))).toBe(false)
    })

    it('no longer offers to launch a story already in progress', () => {
      const wrapper = mount(StoryFeed, {
        props: { story: { ...fresh, status: 'in-progress' } },
        global: { plugins: [VueDsfr] },
      })
      expect(wrapper.findAll('button').some((b) => b.text().includes('Lancer'))).toBe(false)
    })
  })
})
