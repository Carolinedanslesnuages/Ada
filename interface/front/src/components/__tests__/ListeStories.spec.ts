import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ListeStories from '../ListeStories.vue'
import type { ResumeStory } from '@/lib/story'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const story = (numero: number, statut: ResumeStory['statut'], titre: string, autres: Partial<ResumeStory> = {}): ResumeStory => ({
  numero, type: 'story', titre, statut, creeeLe: '', fermeeLe: null, url: '', prete: true, raison: null, ...autres,
})
const stories: ResumeStory[] = [
  story(2, 'en-cours', 'Filtre visio', { type: 'bug' }),
  story(1, 'livree', 'Salles libres'),
  story(3, 'nouvelle', 'Trop grosse', { prete: false, raison: 'Plus de 4 critères' }),
  story(4, 'nouvelle', 'Réserver une salle'),
]

const monter = (numeroCourant: number | null = null) =>
  mount(ListeStories, { props: { stories, numeroCourant }, global: { plugins: [VueDsfr] }, attachTo: document.body })

const boutonStory = (wrapper: ReturnType<typeof monter>, numero: number) =>
  wrapper.findAll('button').find((bouton) => bouton.text().includes(`#${numero}`))

describe('Liste des stories', () => {
  it('signale la story ouverte et demande l’ouverture au clic', async () => {
    const wrapper = monter(1)
    expect(boutonStory(wrapper, 1)!.attributes('aria-current')).toBe('true')
    expect(boutonStory(wrapper, 2)!.attributes('aria-current')).toBeUndefined()
    expect(wrapper.text()).toContain('Livrée')
    expect(boutonStory(wrapper, 2)!.text()).toContain('Problème')
    await boutonStory(wrapper, 2)!.trigger('click')
    expect(wrapper.emitted('ouvrir')?.[0]).toEqual([2])
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('range les stories à lancer dans un accordéon fermé, avec leur nombre ; celles en cours restent visibles', async () => {
    const wrapper = monter()
    const accordeon = wrapper.find('button[aria-controls="stories-a-lancer"]')
    expect(accordeon.text()).toContain('À lancer (2)')
    expect(accordeon.attributes('aria-expanded')).toBe('false')
    expect(boutonStory(wrapper, 2)!.isVisible()).toBe(true)
    await accordeon.trigger('click')
    expect(accordeon.attributes('aria-expanded')).toBe('true')
    expect(boutonStory(wrapper, 3)!.text()).toContain('À corriger sur GitHub')
    await boutonStory(wrapper, 4)!.trigger('click')
    expect(wrapper.emitted('ouvrir')?.[0]).toEqual([4])
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('ouvre d’office l’accordéon quand la story affichée est à lancer', () => {
    const wrapper = monter(4)
    expect(wrapper.find('button[aria-controls="stories-a-lancer"]').attributes('aria-expanded')).toBe('true')
    expect(boutonStory(wrapper, 4)!.attributes('aria-current')).toBe('true')
    wrapper.unmount()
  })

  it('sans story à lancer, pas d’accordéon', () => {
    const wrapper = mount(ListeStories, { props: { stories: [stories[0]!] }, global: { plugins: [VueDsfr] } })
    expect(wrapper.find('button[aria-controls="stories-a-lancer"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
