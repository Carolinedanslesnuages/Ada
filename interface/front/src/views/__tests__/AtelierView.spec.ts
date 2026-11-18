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
    { id: 'poc-portail', nom: 'poc-portail', proprietaire: 'p', compte: 'organisation' as const, reprise: null, repris: false, description: null, prive: true, url: 'https://github.com/p/poc-portail', misAJourLe: null },
    { id: 'annuaire', nom: 'annuaire', proprietaire: 'p', compte: 'organisation' as const, reprise: null, repris: false, description: null, prive: true, url: 'https://github.com/p/annuaire', misAJourLe: null },
  ],
  '/projets/poc-portail/stories': [story],
  '/projets/annuaire/stories': [],
  '/projets/poc-portail/apercu': { etat: 'demarrage', url: null, journal: null },
  '/projets/poc-portail/versions': { actuelle: null, proposee: null },
  '/projets/annuaire/versions': { actuelle: null, proposee: null },
}

/** Monte l'atelier ; aucun projet n'est ouvert à l'arrivée : on choisit `projet` dans le sélecteur. */
const monter = async (projet: string | null = 'poc-portail') => {
  const wrapper = mount(AtelierView, { global: { plugins: [VueDsfr] }, attachTo: document.body })
  await flushPromises()
  if (projet) {
    await wrapper.find('select').setValue(projet)
    await flushPromises()
  }
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

  it('à l’arrivée, aucun projet n’est ouvert : le PO choisit dans le sélecteur', async () => {
    const wrapper = await monter(null)
    expect(wrapper.text()).toContain('Choisissez un projet dans la liste pour l’ouvrir.')
    expect(wrapper.text()).not.toContain('Page d’accueil')
    expect(wrapper.findAll('select option').map((option) => option.text())).toEqual(expect.arrayContaining(['poc-portail', 'annuaire']))
    expect(envoyer).not.toHaveBeenCalledWith('/projets/poc-portail/apercu', {})
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('« Masquer le projet » ferme le projet ouvert, qui reste dans le sélecteur', async () => {
    const wrapper = await monter()
    expect(wrapper.text()).toContain('Page d’accueil')
    await wrapper.findAll('button').find((bouton) => bouton.text() === 'Masquer le projet')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Page d’accueil')
    expect(wrapper.text()).toContain('Choisissez un projet dans la liste pour l’ouvrir.')
    expect(wrapper.findAll('select option').map((option) => option.text())).toContain('poc-portail')
    expect(wrapper.findAll('button').some((bouton) => bouton.text() === 'Masquer le projet')).toBe(false)
    wrapper.unmount()
  })

  it('un projet créé par ADA ne propose ni d’annuler une reprise ni de le désynchroniser', async () => {
    const wrapper = await monter()
    expect(wrapper.findAll('button').some((bouton) => /Annuler la reprise|Désynchroniser/.test(bouton.text()))).toBe(false)
    wrapper.unmount()
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

  it('liste OU demande : « Discuter avec ADA » prend toute la colonne ; « Toutes les demandes » ramène la liste', async () => {
    const wrapper = await monter()
    await wrapper.findAll('button').find((b) => b.text().includes('Discuter avec ADA'))!.trigger('click')
    expect(wrapper.find('h2.fr-h4').text()).toBe('Discuter avec ADA')
    expect(wrapper.find('#titre-stories').exists()).toBe(false)
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.text()).toContain('Projet : poc-portail')
    await wrapper.findAll('button').find((b) => b.text().includes('Toutes les demandes'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('#titre-stories').exists()).toBe(true)
    expect(document.activeElement?.id).toBe('titre-stories')
    expect(wrapper.text()).not.toContain('Discuter avec ADA »')
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
    const wrapper = await monter(null)
    await wrapper.findAll('button').find((b) => b.text().includes('Nouveau projet'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('h2.fr-h4').text()).toBe('Nouveau projet')
    expect(wrapper.text()).toContain('Votre idée')
    // Rien à afficher à droite pendant la création : le formulaire est centré.
    expect(wrapper.find('.fr-grid-row--center form').exists()).toBe(true)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité automatique', async () => {
    const wrapper = await monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
