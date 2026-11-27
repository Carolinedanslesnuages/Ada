import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ProjectResult from '../ProjectResult.vue'
import type { CreationResult } from '@/lib/project'
import { accessibilityViolations } from '@/__tests__/accessibility'

const result = (versions: 'done' | 'to-do', protection: 'done' | 'to-do'): CreationResult => ({
  project: { id: 'annuaire', name: 'annuaire', owner: 'p', account: 'organization' as const, adoption: null, adopted: false, description: null, isPrivate: true, url: 'https://github.com/p/annuaire', updatedAt: null },
  settings: {
    automaticVersions: { state: versions, link: 'https://github.com/p/annuaire/settings/actions' },
    mainProtection: { state: protection, link: 'https://github.com/p/annuaire/settings/rules' },
  },
})

const mountComponent = (r: CreationResult) =>
  mount(ProjectResult, { props: { result: r }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Result of the project creation', () => {
  it('displays no instruction when GitHub accepted everything', () => {
    const wrapper = mountComponent(result('done', 'done'))
    expect(wrapper.text()).toContain('Versions automatiques : activées')
    expect(wrapper.text()).not.toContain('Workflow permissions')
    wrapper.unmount()
  })

  it('guides the PO, with the right link, for the refused settings', async () => {
    const wrapper = mountComponent(result('to-do', 'to-do'))
    expect(wrapper.text()).toContain('Workflow permissions')
    expect(wrapper.find('a[href="https://github.com/p/annuaire/settings/actions"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('compte personnel gratuit')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('offers to write the first story', async () => {
    const wrapper = mountComponent(result('done', 'done'))
    await wrapper.findAll('button').find((b) => b.text().includes('première story'))!.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('announces that the idea is saved and that ADA is studying it (#68)', async () => {
    const wrapper = mountComponent({ ...result('done', 'done'), idea: 1 })
    expect(wrapper.text()).toContain('Votre idée est enregistrée (demande n° 1)')
    await wrapper.findAll('button').find((b) => b.text().includes('Suivre ADA'))!.trigger('click')
    expect(wrapper.emitted('poll')).toEqual([[1]])
    expect(wrapper.text()).not.toContain('Écrire la première story')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
})
