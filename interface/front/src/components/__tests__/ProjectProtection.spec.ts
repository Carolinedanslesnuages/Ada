import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ProjectProtection from '../ProjectProtection.vue'
import { api } from '@/services/api'
import { accessibilityViolations } from '@/__tests__/accessibility'

const mountComponent = (project = 'gladys') => mount(ProjectProtection, { props: { project }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Protection of the main branch (opening of a project)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('asks ADA to check the protection of the open project', async () => {
    const send = vi.spyOn(api, 'send').mockResolvedValue({ state: 'protected', reason: null, link: 'x' })
    const wrapper = mountComponent('mon~poc')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/projects/mon~poc/protection', {})
    expect(wrapper.text()).toBe('') // already protected: nothing to say
    wrapper.unmount()
  })

  it('warns when ADA just protected it', async () => {
    vi.spyOn(api, 'send').mockResolvedValue({ state: 'applied', reason: null, link: 'x' })
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.text()).toContain('ADA vient de protéger la branche principale')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('warns, with the reason and the link to the rules, when GitHub does not allow it', async () => {
    vi.spyOn(api, 'send').mockResolvedValue({
      state: 'impossible',
      reason: 'GitHub ne permet pas de protéger un dépôt privé sur un compte personnel gratuit.',
      link: 'https://github.com/proprio/signalements/rules',
    })
    const wrapper = mountComponent('signalements')
    await flushPromises()
    expect(wrapper.text()).toContain('n’est pas protégée')
    expect(wrapper.text()).toContain('dépôt privé sur un compte personnel gratuit')
    expect(wrapper.find('a').attributes('href')).toBe('https://github.com/proprio/signalements/rules')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('says nothing if the check fails (it will be redone at the next opening)', async () => {
    vi.spyOn(api, 'send').mockRejectedValue(new Error('réseau'))
    const wrapper = mountComponent('autre')
    await flushPromises()
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
  })

  describe('adopted project: ADA proposes, the PO decides', () => {
    const button = (wrapper: ReturnType<typeof mountComponent>, text: string) => wrapper.findAll('button').find((b) => b.text().includes(text))

    it('offers to protect the branch, warning about the consequences for the team', async () => {
      vi.spyOn(api, 'send').mockResolvedValue({ state: 'to-propose', reason: null, link: 'x' })
      const wrapper = mountComponent('secret-santa')
      await flushPromises()
      expect(wrapper.text()).toContain('Protéger la branche principale ?')
      expect(wrapper.text()).toContain('prévenez-les')
      expect(button(wrapper, 'Protéger la branche')).toBeTruthy()
      expect(button(wrapper, 'Ne pas protéger')).toBeTruthy()
      expect(await accessibilityViolations(document.body)).toEqual([])
      wrapper.unmount()
    })

    it('“Protect the branch”: ADA protects it and says so', async () => {
      const send = vi.spyOn(api, 'send').mockResolvedValueOnce({ state: 'to-propose', reason: null, link: 'x' }).mockResolvedValueOnce({ state: 'applied', reason: null, link: 'x' })
      const wrapper = mountComponent('secret-santa')
      await flushPromises()
      await button(wrapper, 'Protéger la branche')!.trigger('click')
      await flushPromises()
      expect(send).toHaveBeenLastCalledWith('/projects/secret-santa/protection/apply', {})
      expect(wrapper.text()).toContain('ADA vient de protéger la branche principale')
      wrapper.unmount()
    })

    it('“Do not protect”: the choice is remembered, and can be reconsidered', async () => {
      const send = vi.spyOn(api, 'send').mockResolvedValueOnce({ state: 'to-propose', reason: null, link: 'x' }).mockResolvedValueOnce({ state: 'refused', reason: null, link: 'x' })
      const wrapper = mountComponent('secret-santa')
      await flushPromises()
      await button(wrapper, 'Ne pas protéger')!.trigger('click')
      await flushPromises()
      expect(send).toHaveBeenLastCalledWith('/projects/secret-santa/protection/refuse', {})
      expect(wrapper.text()).toContain('Branche principale non protégée, à votre demande.')
      expect(wrapper.text()).not.toContain('Protéger la branche principale ?')
      expect(await accessibilityViolations(document.body)).toEqual([])
      await button(wrapper, 'Revenir sur ce choix')!.trigger('click')
      expect(wrapper.text()).toContain('Protéger la branche principale ?')
      wrapper.unmount()
    })

    it('GitHub refuses the requested protection: the reason is displayed', async () => {
      vi.spyOn(api, 'send')
        .mockResolvedValueOnce({ state: 'to-propose', reason: null, link: 'x' })
        .mockResolvedValueOnce({ state: 'impossible', reason: 'GitHub ne permet pas de protéger un dépôt privé sur un compte personnel gratuit.', link: 'x' })
      const wrapper = mountComponent('secret-santa')
      await flushPromises()
      await button(wrapper, 'Protéger la branche')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('dépôt privé sur un compte personnel gratuit')
      wrapper.unmount()
    })
  })
})
