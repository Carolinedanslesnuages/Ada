import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ProtectionProjet from '../ProtectionProjet.vue'
import { api } from '@/services/api'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const monter = (projet = 'gladys') => mount(ProtectionProjet, { props: { projet }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Protection de la branche principale (ouverture d’un projet)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('demande à ADA de vérifier la protection du projet ouvert', async () => {
    const envoyer = vi.spyOn(api, 'envoyer').mockResolvedValue({ etat: 'protegee', raison: null, lien: 'x' })
    const wrapper = monter('mon~poc')
    await flushPromises()
    expect(envoyer).toHaveBeenCalledWith('/projets/mon~poc/protection', {})
    expect(wrapper.text()).toBe('') // déjà protégée : rien à dire
    wrapper.unmount()
  })

  it('prévient quand ADA vient de la protéger', async () => {
    vi.spyOn(api, 'envoyer').mockResolvedValue({ etat: 'posee', raison: null, lien: 'x' })
    const wrapper = monter()
    await flushPromises()
    expect(wrapper.text()).toContain('ADA vient de protéger la branche principale')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('avertit, avec la raison et le lien vers les règles, quand GitHub ne le permet pas', async () => {
    vi.spyOn(api, 'envoyer').mockResolvedValue({
      etat: 'impossible',
      raison: 'GitHub ne permet pas de protéger un dépôt privé sur un compte personnel gratuit.',
      lien: 'https://github.com/proprio/signalements/rules',
    })
    const wrapper = monter('signalements')
    await flushPromises()
    expect(wrapper.text()).toContain('n’est pas protégée')
    expect(wrapper.text()).toContain('dépôt privé sur un compte personnel gratuit')
    expect(wrapper.find('a').attributes('href')).toBe('https://github.com/proprio/signalements/rules')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('ne dit rien pour un projet repris, ni si la vérification échoue', async () => {
    vi.spyOn(api, 'envoyer').mockResolvedValueOnce({ etat: 'non-geree', raison: null, lien: 'x' }).mockRejectedValueOnce(new Error('réseau'))
    const repris = monter('secret-santa')
    await flushPromises()
    expect(repris.text()).toBe('')
    repris.unmount()
    const enEchec = monter('autre')
    await flushPromises()
    expect(enEchec.text()).toBe('')
    enEchec.unmount()
  })
})
