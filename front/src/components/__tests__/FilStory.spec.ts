import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import FilStory from '../FilStory.vue'
import type { DetailStory } from '@/lib/story'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const story: DetailStory = {
  numero: 12,
  titre: 'Voir les salles libres',
  statut: 'questions',
  creeeLe: '2026-11-16T10:00:00Z',
  url: 'https://github.com/proprio/poc/issues/12',
  type: 'story',
  texteBrut: '',
  contenuBug: null,
  contenu: {
    role: "agent d'accueil",
    besoin: 'voir les salles libres',
    benefice: 'proposer une salle',
    criteres: ['une salle sans réservation en cours est libre'],
  },
  messages: [
    { id: 1, auteur: 'assistant', avatar: null, texte: 'Que veut dire « en ce moment » ?', le: '2026-11-16T10:05:00Z' },
  ],
}

const monter = () =>
  mount(FilStory, { props: { story }, global: { plugins: [VueDsfr] }, attachTo: document.body })

describe('Fil d’une story', () => {
  it('affiche la story structurée, son statut et la conversation', () => {
    const wrapper = monter()
    expect(wrapper.text()).toContain("En tant que agent d'accueil")
    expect(wrapper.text()).toContain('une salle sans réservation en cours est libre')
    expect(wrapper.text()).toContain('Questions')
    expect(wrapper.text()).toContain('Que veut dire « en ce moment » ?')
    wrapper.unmount()
  })

  it('envoie la réponse du PO', async () => {
    const wrapper = monter()
    await wrapper.find('textarea').setValue('  L’heure actuelle.  ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('repondre')?.[0]).toEqual(['L’heure actuelle.'])
    wrapper.unmount()
  })

  it('refuse un message vide', async () => {
    const wrapper = monter()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('repondre')).toBeUndefined()
    expect(wrapper.text()).toContain('Écrivez votre message')
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité automatique', async () => {
    const wrapper = monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
  it('affiche un problème signalé, sans violation d’accessibilité', async () => {
    const wrapper = mount(FilStory, {
      props: {
        story: {
          ...story,
          type: 'bug',
          contenu: null,
          contenuBug: {
            constate: 'Aucune salle le lundi',
            attendu: 'Les salles libres',
            etapes: '1. Ouvrir la liste un lundi',
            ecran: '/salles-libres',
          },
        },
      },
      global: { plugins: [VueDsfr] },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('Ce qui se passe')
    expect(wrapper.text()).toContain('Aucune salle le lundi')
    expect(wrapper.text()).toContain('/salles-libres')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
