import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { violationsAccessibilite } from '@/__tests__/accessibilite'
import HomeView from '../HomeView.vue'

function monter () {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomeView },
    ],
  })
  return mount(HomeView, {
    global: {
      plugins: [router],
    },
    attachTo: document.body,
  })
}

describe('page d’accueil', () => {
  it('affiche le nom du projet', () => {
    const wrapper = monter()
    expect(wrapper.find('h1').text()).toBe('__NOM_PROJET__')
    wrapper.unmount()
  })

  it('aucune violation d’accessibilité automatique', async () => {
    const wrapper = monter()
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
})
