import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import PanneauApercu from '../PanneauApercu.vue'
import { api } from '@/services/api'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: {
    lire: vi.fn<(chemin: string) => Promise<unknown>>(),
    envoyer: vi.fn<(chemin: string, corps: unknown) => Promise<unknown>>(),
  },
}))
const lire = vi.mocked(api.lire)
const envoyer = vi.mocked(api.envoyer)

const monter = (projet: string | null) =>
  mount(PanneauApercu, { props: { projet, intervalleMs: 1 }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Panneau d’aperçu', () => {
  beforeEach(() => {
    lire.mockReset()
    envoyer.mockReset()
  })

  it('démarre l’aperçu du projet, attend qu’il réponde, puis affiche l’application', async () => {
    envoyer.mockResolvedValue({ etat: 'demarrage', url: null, journal: null })
    lire.mockResolvedValueOnce({ etat: 'demarrage', url: null, journal: null }).mockResolvedValue({
      etat: 'pret',
      url: 'http://localhost:5300',
      journal: null,
    })
    const wrapper = monter('poc-portail')
    await flushPromises()
    expect(envoyer).toHaveBeenCalledWith('/projets/poc-portail/apercu', {})
    expect(wrapper.text()).toContain('Préparation de l’aperçu')
    await vi.waitFor(() => expect(wrapper.find('iframe').exists()).toBe(true))
    const cadre = wrapper.find('iframe')
    expect(cadre.attributes('src')).toBe('http://localhost:5300')
    expect(cadre.attributes('title')).toBe('Aperçu de l’application poc-portail')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('montre le journal et propose de réessayer si l’application ne démarre pas', async () => {
    envoyer.mockResolvedValue({ etat: 'erreur', url: null, journal: 'npm ERR! code 1' })
    const wrapper = monter('poc-portail')
    await flushPromises()
    expect(wrapper.text()).toContain('L’application ne démarre pas')
    expect(wrapper.text()).toContain('npm ERR! code 1')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Réessayer')).toBe(true)
    wrapper.unmount()
  })

  it('reprise à valider : n’essaie pas de démarrer, explique pourquoi (#37)', () => {
    const wrapper = mount(PanneauApercu, {
      props: { projet: 'aminimo', enAttente: 'L’aperçu démarrera une fois la reprise validée.' },
      global: { plugins: [VueDsfr] },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('L’aperçu démarrera une fois la reprise validée.')
    expect(envoyer).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('invite à choisir un projet quand aucun n’est sélectionné', () => {
    const wrapper = monter(null)
    expect(wrapper.text()).toContain('Choisissez un projet')
    expect(envoyer).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
