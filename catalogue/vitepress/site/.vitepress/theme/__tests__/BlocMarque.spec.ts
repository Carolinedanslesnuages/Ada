import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import BlocMarque from '../BlocMarque.vue'

describe('Bloc-marque', () => {
  it('affiche « République française », décoratif pour les lecteurs d’écran (le nom du site suit)', async () => {
    const wrapper = mount(BlocMarque, { attachTo: document.body })
    expect(wrapper.text()).toBe('Républiquefrançaise')
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    const resultat = await axe.run(document.body)
    expect(resultat.violations).toEqual([])
    wrapper.unmount()
  })
})
