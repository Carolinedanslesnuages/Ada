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
  fermeeLe: null,
  url: 'https://github.com/proprio/poc/issues/12',
  type: 'story',
  texteBrut: '',
  contenuBug: null,
  contenuLibre: null,
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
  const monterAvec = (props: Record<string, unknown>) =>
    mount(FilStory, { props: { story, ...props }, global: { plugins: [VueDsfr] }, attachTo: document.body })
  const bouton = (wrapper: ReturnType<typeof monterAvec>, texte: string) =>
    wrapper.findAll('button').find((b) => b.text().includes(texte))

  it('ne demande rien d’écrire tant que la story n’est pas lancée', () => {
    const wrapper = monterAvec({ story: { ...story, statut: 'nouvelle', messages: [] } })
    expect(wrapper.find('textarea').exists()).toBe(false)
    wrapper.unmount()
  })

  it('montre que l’assistant travaille, avec ses dernières actions, sans rien demander', async () => {
    const wrapper = monterAvec({
      story: { ...story, statut: 'en-cours' },
      activite: {
        phase: 'realisation',
        enCours: true,
        debut: '2026-11-16T14:00:00Z',
        journal: [
          { le: '2026-11-16T14:01:00Z', texte: 'Lit src/App.vue' },
          { le: '2026-11-16T14:02:00Z', texte: 'Lance les tests' },
        ],
        erreur: null,
        pullRequest: null,
      },
    })
    expect(wrapper.text()).toContain('L’assistant réalise la demande…')
    expect(wrapper.text()).toContain('ce n’est pas encore terminé')
    expect(wrapper.text()).toContain('Lance les tests')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('signe « Assistant » les messages de l’assistant, sans marqueur technique', () => {
    const wrapper = monterAvec({
      story: {
        ...story,
        messages: [{ id: 9, auteur: 'po1', avatar: null, texte: '<!-- atelier-po:assistant -->\n🤖 **Plan proposé**\n\nJe vais…', le: '2026-11-16T10:05:00Z' }],
      },
    })
    expect(wrapper.text()).toContain('Assistant')
    expect(wrapper.text()).not.toContain('atelier-po:assistant')
    wrapper.unmount()
  })

  it('fait valider le plan par un bouton', async () => {
    const wrapper = monterAvec({ story: { ...story, statut: 'plan-a-valider' } })
    expect(wrapper.find('textarea').exists()).toBe(false)
    await bouton(wrapper, 'Valider le plan')!.trigger('click')
    expect(wrapper.emitted('valider')).toHaveLength(1)
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('permet de demander une modification du plan', async () => {
    const wrapper = monterAvec({ story: { ...story, statut: 'plan-a-valider' } })
    await bouton(wrapper, 'Demander une modification')!.trigger('click')
    await wrapper.find('textarea').setValue('Ajouter la météo')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('repondre')?.[0]).toEqual(['Ajouter la météo'])
    wrapper.unmount()
  })

  it('demande une réponse quand l’assistant pose des questions', async () => {
    const wrapper = monterAvec({})
    expect(wrapper.text()).toContain('L’assistant attend vos réponses')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('repondre')).toBeUndefined()
    expect(wrapper.text()).toContain('Écrivez vos réponses')
    await wrapper.find('textarea').setValue('  En toutes lettres.  ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('repondre')?.[0]).toEqual(['En toutes lettres.'])
    wrapper.unmount()
  })

  it('propose de relancer l’assistant sur une demande en cours où rien ne tourne', async () => {
    const wrapper = monterAvec({
      story: { ...story, statut: 'en-cours' },
      activite: { phase: null, enCours: false, debut: null, journal: [], erreur: null, pullRequest: null },
    })
    expect(wrapper.text()).toContain('L’assistant ne travaille pas sur cette demande en ce moment')
    await bouton(wrapper, 'Relancer l’assistant')!.trigger('click')
    expect(wrapper.emitted('relancer')).toHaveLength(1)
    wrapper.unmount()
  })

  describe('Vérification et fusion', () => {
    const controle = (etat: 'reussi' | 'en-cours' | 'echec') => [
      { nom: 'Anti-fuite (gitleaks)', etat: 'reussi' as const, lien: null },
      { nom: 'Front', etat, lien: null },
    ]
    const verification = (etat: 'reussi' | 'en-cours' | 'echec', fusionnable: boolean, raison: string | null) => ({
      pullRequest: { numero: 3, url: 'https://github.com/p/poc/pull/3', etat: 'ouverte' as const },
      controles: controle(etat),
      fusionnable,
      raison,
    })

    it('n’active « Valider et fusionner » que si tous les contrôles sont réussis', async () => {
      const wrapper = monterAvec({ story: { ...story, statut: 'en-verification' }, verification: verification('reussi', true, null) })
      expect(wrapper.text()).toContain('À vous de vérifier')
      expect(wrapper.text()).toContain('Front : réussi')
      const fusion = bouton(wrapper, 'Valider et fusionner')!
      expect(fusion.attributes('disabled')).toBeUndefined()
      await fusion.trigger('click')
      expect(wrapper.emitted('fusionner')).toHaveLength(1)
      expect(await violationsAccessibilite(document.body)).toEqual([])
      wrapper.unmount()
    })

    it('garde le bouton inactif pendant les contrôles, et dit pourquoi', () => {
      const wrapper = monterAvec({ story: { ...story, statut: 'en-verification' }, verification: verification('en-cours', false, 'Contrôles en cours…') })
      expect(bouton(wrapper, 'Valider et fusionner')!.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Contrôles en cours…')
      expect(wrapper.text()).toContain('Front : en cours')
      wrapper.unmount()
    })
  })

  it('affiche une demande libre (mode sauvage)', () => {
    const wrapper = monterAvec({ story: { ...story, type: 'libre', contenu: null, contenuLibre: 'Mets le titre en bleu' } })
    expect(wrapper.text()).toContain('Demande libre (hors story)')
    expect(wrapper.text()).toContain('Mets le titre en bleu')
    expect(wrapper.text()).toContain('Enregistrée sur GitHub comme demande n° 12 « mode libre »')
    wrapper.unmount()
  })

  it('montre le lien vers la pull request une fois la réalisation terminée', () => {
    const wrapper = monterAvec({
      story: { ...story, statut: 'en-verification' },
      activite: { phase: 'realisation', enCours: false, debut: null, journal: [], erreur: null, pullRequest: 'https://github.com/p/poc/pull/2' },
    })
    expect(wrapper.find('a[href="https://github.com/p/poc/pull/2"]').exists()).toBe(true)
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
