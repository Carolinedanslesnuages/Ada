import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ModeleView from '../ModeleView.vue'
import { api, ErreurApi } from '@/services/api'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: {
    lire: vi.fn<(chemin: string) => Promise<unknown>>(),
    envoyer: vi.fn<(chemin: string, corps: unknown) => Promise<unknown>>(),
    remplacer: vi.fn<(chemin: string, corps: unknown) => Promise<unknown>>(),
    supprimer: vi.fn<(chemin: string) => Promise<unknown>>(),
  },
}))

const VIDE = { configure: false, adresse: '', modele: '', cleFin: null, parDefaut: 'sonnet' }
const CONFIGURE = { configure: true, adresse: 'https://llm.exemple.fr/v1', modele: 'glm-5', cleFin: '…1234', parDefaut: 'sonnet' }

const monter = async (etat: unknown = VIDE) => {
  vi.mocked(api.lire).mockResolvedValue(etat)
  const wrapper = mount(ModeleView, { global: { plugins: [VueDsfr] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const remplir = async (wrapper: Awaited<ReturnType<typeof monter>>) => {
  await wrapper.find('#modele-adresse').setValue('https://llm.exemple.fr/v1')
  await wrapper.find('#modele-cle').setValue('sk-secret-1234')
  await wrapper.find('#modele-nom').setValue('glm-5')
}

describe('Mon modèle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('annonce le modèle par défaut tant que rien n’est renseigné', async () => {
    const wrapper = await monter()
    expect(wrapper.text()).toContain('Modèle par défaut d’ADA')
    expect(wrapper.text()).toContain('sonnet')
    expect(wrapper.text()).not.toContain('Revenir au modèle par défaut')
  })

  it('enregistre adresse, clé et nom, puis vide le champ de la clé sans jamais la réafficher', async () => {
    vi.mocked(api.remplacer).mockResolvedValue(CONFIGURE)
    const wrapper = await monter()
    await remplir(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.remplacer).toHaveBeenCalledWith('/modele', { adresse: 'https://llm.exemple.fr/v1', cle: 'sk-secret-1234', modele: 'glm-5' })
    expect((wrapper.find('#modele-cle').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('Votre modèle est utilisé : glm-5')
    expect(wrapper.text()).toContain('…1234')
    expect(wrapper.text()).not.toContain('sk-secret-1234')
  })

  it('montre les erreurs de saisie du serveur à côté des champs', async () => {
    vi.mocked(api.remplacer).mockRejectedValue(new ErreurApi(400, 'Erreur 400', { adresse: 'L’adresse doit commencer par https://.' }))
    const wrapper = await monter()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('L’adresse doit commencer par https://.')
  })

  it('teste la connexion et dit si le modèle sait appeler des outils', async () => {
    vi.mocked(api.envoyer).mockResolvedValue({ ok: true, appelsOutils: false, message: 'Connexion réussie, mais ce modèle n’a pas appelé l’outil demandé.' })
    const wrapper = await monter(CONFIGURE)
    const bouton = wrapper.findAll('button').find((candidat) => candidat.text().includes('Tester la connexion'))!
    await bouton.trigger('click')
    await flushPromises()
    expect(api.envoyer).toHaveBeenCalledWith('/modele/tester', expect.objectContaining({ modele: 'glm-5' }))
    expect(wrapper.text()).toContain('n’a pas appelé l’outil demandé')
  })

  it('permet de revenir au modèle par défaut', async () => {
    vi.mocked(api.supprimer).mockResolvedValue(VIDE)
    const wrapper = await monter(CONFIGURE)
    await wrapper.findAll('button').find((candidat) => candidat.text().includes('Revenir au modèle par défaut'))!.trigger('click')
    await flushPromises()
    expect(api.supprimer).toHaveBeenCalledWith('/modele')
    expect(wrapper.text()).toContain('Modèle par défaut d’ADA')
  })

  it('respecte les règles d’accessibilité', async () => {
    const wrapper = await monter(CONFIGURE)
    expect(await violationsAccessibilite(wrapper.element as HTMLElement)).toEqual([])
  })
})
