import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ListeStories from '../ListeStories.vue'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const stories = [
  { numero: 2, type: 'bug' as const, titre: 'Filtre visio', statut: 'en-cours' as const, creeeLe: '', url: '', prete: true, raison: null },
  { numero: 1, type: 'story' as const, titre: 'Salles libres', statut: 'livree' as const, creeeLe: '', url: '', prete: true, raison: null },
  { numero: 3, type: 'story' as const, titre: 'Trop grosse', statut: 'nouvelle' as const, creeeLe: '', url: '', prete: false, raison: 'Plus de 4 critères' },
]

describe('Liste des stories', () => {
  it('signale la story ouverte et demande l’ouverture au clic', async () => {
    const wrapper = mount(ListeStories, {
      props: { stories, numeroCourant: 1 },
      global: { plugins: [VueDsfr] },
      attachTo: document.body,
    })
    const boutons = wrapper.findAll('button')
    expect(boutons[1]!.attributes('aria-current')).toBe('true')
    expect(boutons[0]!.attributes('aria-current')).toBeUndefined()
    expect(wrapper.text()).toContain('Livrée')
    expect(boutons[0]!.text()).toContain('Problème')
    expect(boutons[2]!.text()).toContain('À corriger sur GitHub')
    await boutons[0]!.trigger('click')
    expect(wrapper.emitted('ouvrir')?.[0]).toEqual([2])
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
