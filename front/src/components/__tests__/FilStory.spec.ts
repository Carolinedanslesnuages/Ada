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
  prete: true,
  raison: null,
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
  it('ne demande rien d’écrire tant que la story n’est pas lancée', () => {
    const wrapper = mount(FilStory, {
      props: { story: { ...story, statut: 'nouvelle', messages: [] } },
      global: { plugins: [VueDsfr] },
    })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Votre réponse')
    wrapper.unmount()
  })

  it('ne demande rien d’écrire pendant que l’assistant travaille', () => {
    const wrapper = mount(FilStory, {
      props: { story: { ...story, statut: 'en-cours' } },
      global: { plugins: [VueDsfr] },
    })
    expect(wrapper.find('textarea').exists()).toBe(false)
    wrapper.unmount()
  })

  it('demande une réponse quand l’assistant pose des questions', () => {
    const wrapper = mount(FilStory, { props: { story }, global: { plugins: [VueDsfr] } })
    expect(wrapper.text()).toContain('L’assistant attend vos réponses')
    expect(wrapper.find('textarea').exists()).toBe(true)
    wrapper.unmount()
  })

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
  describe('Lancement', () => {
    const nouvelle = { ...story, statut: 'nouvelle' as const, messages: [] }

    it('propose de lancer une story prête quand rien d’autre n’est en cours', async () => {
      const wrapper = mount(FilStory, { props: { story: nouvelle }, global: { plugins: [VueDsfr] }, attachTo: document.body })
      const bouton = wrapper.findAll('button').find((b) => b.text().includes('Lancer cette story'))!
      await bouton.trigger('click')
      expect(wrapper.emitted('lancer')).toHaveLength(1)
      expect(await violationsAccessibilite(document.body)).toEqual([])
      wrapper.unmount()
    })

    it('explique qu’une autre demande est en cours, sans bouton', () => {
      const wrapper = mount(FilStory, {
        props: { story: nouvelle, autreEnCours: { numero: 7, titre: 'Accueil' } },
        global: { plugins: [VueDsfr] },
      })
      expect(wrapper.text()).toContain('La demande #7 « Accueil » est en cours : une seule à la fois')
      expect(wrapper.findAll('button').some((b) => b.text().includes('Lancer'))).toBe(false)
    })

    it('demande de corriger sur GitHub une story qui n’est pas prête', () => {
      const wrapper = mount(FilStory, {
        props: { story: { ...nouvelle, prete: false, raison: 'Plus de 4 critères : découpez-la' } },
        global: { plugins: [VueDsfr] },
      })
      expect(wrapper.text()).toContain('À corriger sur GitHub avant de la lancer : Plus de 4 critères')
      expect(wrapper.findAll('button').some((b) => b.text().includes('Lancer'))).toBe(false)
    })

    it('ne propose plus de lancer une story déjà en cours', () => {
      const wrapper = mount(FilStory, {
        props: { story: { ...nouvelle, statut: 'en-cours' } },
        global: { plugins: [VueDsfr] },
      })
      expect(wrapper.findAll('button').some((b) => b.text().includes('Lancer'))).toBe(false)
    })
  })
})
