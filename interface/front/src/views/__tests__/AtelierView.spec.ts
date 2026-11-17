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
const envoyer = vi.mocked(api.envoyer)

const story = { numero: 1, type: 'story', titre: 'Page d’accueil', statut: 'nouvelle', creeeLe: '', url: '', prete: true, raison: null }

const reponses: Record<string, unknown> = {
  '/projets': [
    { id: 'poc-portail', nom: 'poc-portail', proprietaire: 'p', compte: 'organisation' as const, reprise: null, description: null, prive: true, url: 'https://github.com/p/poc-portail', misAJourLe: null },
    { id: 'annuaire', nom: 'annuaire', proprietaire: 'p', compte: 'organisation' as const, reprise: null, description: null, prive: true, url: 'https://github.com/p/annuaire', misAJourLe: null },
  ],
  '/projets/poc-portail/stories': [story],
  '/projets/annuaire/stories': [],
  '/projets/poc-portail/apercu': { etat: 'demarrage', url: null, journal: null },
  '/projets/poc-portail/versions': { actuelle: null, proposee: null },
  '/projets/annuaire/versions': { actuelle: null, proposee: null },
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
    envoyer.mockReset()
    lire.mockImplementation(async (chemin: string) => reponses[chemin])
    envoyer.mockResolvedValue({ etat: 'demarrage', url: null, journal: null })
  })

  it('affiche les stories écrites dans GitHub à côté de l’aperçu, qui démarre tout seul', async () => {
    const wrapper = await monter()
    expect(wrapper.text()).toContain('Page d’accueil')
    expect(wrapper.text()).toContain('Préparation de l’aperçu de « poc-portail »')
    expect(envoyer).toHaveBeenCalledWith('/projets/poc-portail/apercu', {})
    wrapper.unmount()
  })

  it('n’offre aucun formulaire de story : on écrit sur GitHub', async () => {
    const wrapper = await monter()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('a[href="https://github.com/p/poc-portail/issues/new?template=user-story.yml"]').exists()).toBe(true)
    expect(wrapper.find('a[href="https://github.com/p/poc-portail/issues/new?template=bug.yml"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('ouvre le formulaire « Prompter » quand aucune demande n’est en cours', async () => {
    const wrapper = await monter()
    const prompter = wrapper.findAll('button').find((b) => b.text().includes('Prompter'))!
    expect(prompter.attributes('disabled')).toBeUndefined()
    await prompter.trigger('click')
    expect(wrapper.find('h2.fr-h4').text()).toBe('Prompter (mode libre)')
    wrapper.unmount()
  })

  it('désactive « Prompter » quand une demande est déjà en cours', async () => {
    lire.mockImplementation(async (chemin: string) =>
      chemin === '/projets/poc-portail/stories' ? [{ ...story, statut: 'en-cours' }] : reponses[chemin],
    )
    const wrapper = await monter()
    const prompter = wrapper.findAll('button').find((b) => b.text().includes('Prompter'))!
    expect(prompter.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('relit la liste quand on clique sur « Actualiser »', async () => {
    const wrapper = await monter()
    lire.mockClear()
    await wrapper.findAll('button').find((b) => b.text().includes('Actualiser'))!.trigger('click')
    await flushPromises()
    expect(lire).toHaveBeenCalledWith('/projets/poc-portail/stories')
    wrapper.unmount()
  })

  it('recharge les stories quand on change de projet', async () => {
    const wrapper = await monter()
    await wrapper.find('select').setValue('annuaire')
    await flushPromises()
    expect(lire).toHaveBeenCalledWith('/projets/annuaire/stories')
    expect(wrapper.text()).toContain('Aucune story pour l’instant')
    wrapper.unmount()
  })

  it('propose de créer un projet quand il n’y en a aucun', async () => {
    lire.mockImplementation(async (chemin: string) =>
      chemin === '/projets'
        ? []
        : chemin === '/projets/modeles'
          ? {
              familles: [{ id: 'service', libelle: 'Un service' }],
              types: [{ id: 'service', famille: 'service', libelle: 'Service en ligne', description: 'Une application' }],
              modeles: [{ id: 'vue-nest-dsfr', type: 'service', libelle: 'Vue 3 + NestJS', pourQuoi: 'Métier', disponible: true, deployable: false }],
            }
          : undefined,
    )
    const wrapper = await monter()
    await wrapper.findAll('button').find((b) => b.text().includes('Nouveau projet'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('h2.fr-h4').text()).toBe('Nouveau projet')
    expect(wrapper.text()).toContain('Que voulez-vous créer ?')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité automatique', async () => {
    const wrapper = await monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
