import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ListeStories from '../ListeStories.vue'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const stories = [
  { numero: 2, titre: 'Filtre visio', statut: 'en-cours' as const, creeeLe: '', url: '' },
  { numero: 1, titre: 'Salles libres', statut: 'livree' as const, creeeLe: '', url: '' },
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
    await boutons[0]!.trigger('click')
    expect(wrapper.emitted('ouvrir')?.[0]).toEqual([2])
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
