import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import VueDsfr from '@gouvminint/vue-dsfr'
import SignInView from '../SignInView.vue'
import { accessibilityViolations } from '@/__tests__/accessibility'

const mountComponent = async (url: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/sign-in', component: SignInView }],
  })
  await router.push(url)
  return mount(SignInView, { global: { plugins: [VueDsfr, router] }, attachTo: document.body })
}

describe('Sign-in screen', () => {
  it('offers the GitHub sign-in', async () => {
    const wrapper = await mountComponent('/sign-in')
    expect(wrapper.find('a[href="/api/auth/github"]').text()).toBe('Se connecter avec GitHub')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('presents ADA as a tool for non-developers', async () => {
    const wrapper = await mountComponent('/sign-in')
    expect(wrapper.findAll('h1')).toHaveLength(1)
    // The title is the logo in capitals; its alternative text gives the name to screen readers.
    const logo = wrapper.find('h1 img')
    expect(logo.attributes('alt')).toBe('ADA')
    expect(logo.attributes('src')).toMatch(/logo-ada-capitales|titre-ada-capitales/)
    expect(wrapper.text()).toContain('Un outil pour les non-développeurs')
    wrapper.unmount()
  })

  it('explains the journey in five steps, in order', async () => {
    const wrapper = await mountComponent('/sign-in')
    const steps = wrapper.findAll('ol li h3').map((h) => h.text())
    expect(steps).toEqual([
      'Créez votre projet',
      'Écrivez vos stories',
      'Validez le plan',
      'Regardez le résultat',
      'Publiez la version',
    ])
    wrapper.unmount()
  })

  it('lists the quality guarantees', async () => {
    const wrapper = await mountComponent('/sign-in')
    expect(wrapper.text()).toContain('Des tests à chaque story')
    expect(wrapper.text()).toContain('L’accessibilité vérifiée')
    wrapper.unmount()
  })

  it('also offers the sign-in at the bottom of the page', async () => {
    const wrapper = await mountComponent('/sign-in')
    expect(wrapper.findAll('a[href="/api/auth/github"]')).toHaveLength(2)
    wrapper.unmount()
  })

  it('displays a message if the sign-in failed', async () => {
    const wrapper = await mountComponent('/sign-in?error=state')
    expect(wrapper.text()).toContain('La connexion n’a pas abouti')
    expect(await accessibilityViolations(document.body)).toEqual([])
    wrapper.unmount()
  })
  it('explains that an account is not allowed', async () => {
    const wrapper = await mountComponent('/sign-in?error=not-allowed')
    expect(wrapper.text()).toContain('n’est pas autorisé à utiliser cet atelier')
    wrapper.unmount()
  })
  it('explains a refusal from GitHub without technical detail', async () => {
    const wrapper = await mountComponent('/sign-in?error=github')
    expect(wrapper.text()).toContain('GitHub a refusé la connexion de l’atelier')
    wrapper.unmount()
  })
})
