import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import VueDsfr from '@gouvminint/vue-dsfr'
import ConnexionView from '../ConnexionView.vue'
import { violationsAccessibilite } from '@/__tests__/accessibilite'

const monter = async (url: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/connexion', component: ConnexionView }],
  })
  await router.push(url)
  return mount(ConnexionView, { global: { plugins: [VueDsfr, router] }, attachTo: document.body })
}

describe('Écran de connexion', () => {
  it('propose la connexion GitHub', async () => {
    const wrapper = await monter('/connexion')
    expect(wrapper.find('a[href="/api/auth/github"]').text()).toBe('Se connecter avec GitHub')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('affiche un message si la connexion a échoué', async () => {
    const wrapper = await monter('/connexion?erreur=etat')
    expect(wrapper.text()).toContain('La connexion n’a pas abouti')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })
  it('explique qu’un compte n’est pas autorisé', async () => {
    const wrapper = await monter('/connexion?erreur=non-autorise')
    expect(wrapper.text()).toContain('n’est pas autorisé à utiliser cet atelier')
    wrapper.unmount()
  })
})
