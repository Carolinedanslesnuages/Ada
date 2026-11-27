import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import BreakdownProposal from '../BreakdownProposal.vue'
import { accessibilityViolations } from '@/__tests__/accessibility'

const STORIES = [
  { title: 'Voir le matériel', role: 'agent', need: 'voir la liste', benefit: 'savoir', criteria: ['Liste'] },
  { title: 'Emprunter', role: 'agent', need: 'emprunter', benefit: 'éviter Excel', criteria: ['Bouton'] },
  { title: 'Rendre', role: 'agent', need: 'rendre', benefit: 'libérer', criteria: ['Bouton Rendre'] },
]
const mountComponent = () =>
  mount(BreakdownProposal, { props: { stories: STORIES, designation: 'la demande n° 4' }, global: { plugins: [VueDsfr] }, attachTo: document.body })
const field = (wrapper: ReturnType<typeof mountComponent>, label: string) => {
  const tag = wrapper.findAll('label').find((element) => element.text().startsWith(label))!
  return wrapper.find(`#${tag.attributes('for')}`)
}

describe('Breakdown proposal', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('a story that overlaps an existing story arrives unticked, with a warning', async () => {
    const stories = [STORIES[0]!, { ...STORIES[1]!, duplicateOf: 31 }, STORIES[2]!]
    const wrapper = mount(BreakdownProposal, { props: { stories, designation: 'la demande n° 4' }, global: { plugins: [VueDsfr] }, attachTo: document.body })
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.map((checkbox) => (checkbox.element as HTMLInputElement).checked)).toEqual([true, false, true])
    expect(wrapper.text()).toContain('Une story ressemble à une story déjà écrite : je ne l’ai pas cochée.')
    expect(wrapper.find('#proposed-story-1-duplicate').text()).toContain('Ressemble à la story n° 31, déjà dans le projet')
    expect(checkboxes[1]!.attributes('aria-describedby')).toBe('proposed-story-1-duplicate')
    expect(wrapper.find('button[type="submit"]').text()).toBe('Publier les 2 stories sur GitHub')
    expect(await accessibilityViolations(wrapper.element)).toEqual([])
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('create')).toEqual([[[STORIES[0], STORIES[2]]]])
    wrapper.unmount()
  })

  it('short to read: only the titles, ticked; the detail is collapsed', () => {
    const wrapper = mountComponent()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.map((checkbox) => (checkbox.element as HTMLInputElement).checked)).toEqual([true, true, true])
    expect(wrapper.findAll('label').filter((tag) => tag.text().startsWith('Publier')).map((tag) => tag.text())).toEqual([
      'Publier « Voir le matériel »',
      'Publier « Emprunter »',
      'Publier « Rendre »',
    ])
    expect(wrapper.findAll('button[aria-expanded="true"]')).toHaveLength(0)
    expect(wrapper.find('button[type="submit"]').text()).toBe('Publier les 3 stories sur GitHub')
    wrapper.unmount()
  })

  it('prefilled fields: the PO corrects, unticks, and only has to approve', async () => {
    const wrapper = mountComponent()
    await wrapper.find('#proposed-story-1').setValue(false)
    await field(wrapper, 'Critères d’acceptation (story 3)').setValue('Bouton Rendre\n- Message de confirmation')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('create')).toEqual([
      [
        [
          STORIES[0],
          { title: 'Rendre', role: 'agent', need: 'rendre', benefit: 'libérer', criteria: ['Bouton Rendre', 'Message de confirmation'] },
        ],
      ],
    ])
    wrapper.unmount()
  })

  it('reports an incomplete story, opens it, and publishes nothing', async () => {
    const wrapper = mountComponent()
    await field(wrapper, 'Je veux (story 2)').setValue('  ')
    await field(wrapper, 'Critères d’acceptation (story 3)').setValue('a\nb\nc\nd\ne')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('create')).toBeUndefined()
    const alerts = wrapper.findAll('[role="alert"]').map((alert) => alert.text()).filter(Boolean)
    expect(alerts).toEqual(['Story 2 : Complétez « je veux »', 'Story 3 : De 1 à 4 critères d’acceptation, un par ligne'])
    wrapper.unmount()
  })

  it('refuses to publish without a ticked story, and lets another breakdown be requested', async () => {
    const wrapper = mountComponent()
    for (const rank of [0, 1, 2]) await wrapper.find(`#proposed-story-${rank}`).setValue(false)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Cochez au moins une story')
    await wrapper.findAll('button').find((button) => button.text() === 'Demander un autre découpage')!.trigger('click')
    expect(wrapper.emitted('otherBreakdown')).toHaveLength(1)
    wrapper.unmount()
  })

  it('no automatic accessibility violation, open detail included', async () => {
    const wrapper = mountComponent()
    expect(await accessibilityViolations(document.body)).toEqual([])
    await wrapper.findAll('button[aria-expanded]')[0]!.trigger('click')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})
