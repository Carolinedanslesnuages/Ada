import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import VueDsfr from '@gouvminint/vue-dsfr'
import AtelierView from '../AtelierView.vue'
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

const reponses: Record<string, unknown> = {
  '/projets': [
    { nom: 'reservation-de-salles', description: null, prive: true, url: '', misAJourLe: null },
    { nom: 'annuaire', description: null, prive: true, url: '', misAJourLe: null },
  ],
  '/projets/reservation-de-salles/stories': [
    { numero: 1, type: 'story', titre: 'Salles libres', statut: 'livree', creeeLe: '', url: '' },
  ],
  '/projets/annuaire/stories': [],
}

const monter = async () => {
  const wrapper = mount(AtelierView, { global: { plugins: [VueDsfr] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('Écran de l’atelier', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    lire.mockReset()
    lire.mockImplementation(async (chemin: string) => reponses[chemin])
  })

  it('ouvre le premier projet et affiche ses stories à côté de l’aperçu', async () => {
    const wrapper = await monter()
    expect(wrapper.text()).toContain('Salles libres')
    expect(wrapper.text()).toContain('Aperçu')
    expect(wrapper.text()).toContain('reservation-de-salles')
    wrapper.unmount()
  })

  it('recharge les stories quand on change de projet', async () => {
    const wrapper = await monter()
    await wrapper.find('select').setValue('annuaire')
    await flushPromises()
    expect(lire).toHaveBeenCalledWith('/projets/annuaire/stories')
    expect(wrapper.text()).toContain('Aucune story dans ce projet')
    wrapper.unmount()
  })

  it('ouvre le formulaire de signalement de problème', async () => {
    const wrapper = await monter()
    const bouton = wrapper.findAll('button').find((b) => b.text().includes('Signaler un problème'))!
    await bouton.trigger('click')
    expect(wrapper.find('h2.fr-h4').text()).toBe('Signaler un problème')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité automatique', async () => {
    const wrapper = await monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
