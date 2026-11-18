import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import VueDsfr from '@gouvminint/vue-dsfr'
import ConversationAda from '../ConversationAda.vue'
import { violationsAccessibilite } from '@/__tests__/accessibilite'
import type { DetailStory } from '@/lib/story'

const conversation: DetailStory = {
  numero: 9,
  type: 'conversation',
  titre: 'Conversation : mets le titre en bleu',
  statut: 'echange',
  creeeLe: '2026-11-18T10:00:00Z',
  fermeeLe: null,
  url: 'https://github.com/po/poc/issues/9',
  prete: true,
  raison: null,
  assignes: [],
  contenu: null,
  contenuBug: null,
  contenuLibre: 'Mets le titre en bleu',
  texteBrut: '',
  messages: [
    { id: 1, auteur: 'po1', avatar: null, texte: '▶️ Lancée depuis ADA par po1 (conversation).', le: '2026-11-18T10:00:00Z' },
    { id: 2, auteur: 'po1', avatar: null, texte: '<!-- atelier-po:assistant -->\n🤖 **ADA**\n\nC’est fait : le titre est bleu.', le: '2026-11-18T10:01:00Z' },
  ],
}
const monter = (props: Partial<{ attendReponse: boolean; story: DetailStory }> = {}) =>
  mount(ConversationAda, { props: { story: conversation, attendReponse: true, ...props }, global: { plugins: [VueDsfr] }, attachTo: document.body })
const bouton = (wrapper: ReturnType<typeof monter>, libelle: string) => wrapper.findAll('button').find((b) => b.text().includes(libelle))

describe('Conversation avec ADA', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('montre tous les échanges dans l’ordre, sans le commentaire de lancement', async () => {
    const wrapper = monter()
    const messages = wrapper.findAll('ol.conversation > li').map((li) => li.text())
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain('Vous')
    expect(messages[0]).toContain('Mets le titre en bleu')
    expect(messages[1]).toContain('ADA')
    expect(messages[1]).toContain('C’est fait : le titre est bleu.')
    expect(wrapper.text()).not.toContain('Lancée depuis ADA')
    expect(messages[1]).not.toContain('🤖')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    wrapper.unmount()
  })

  it('envoie le message suivant ; refuse un message vide', async () => {
    const wrapper = monter()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Écrivez votre message à ADA')
    expect(wrapper.emitted('envoyer')).toBeUndefined()
    await wrapper.find('textarea').setValue('  plutôt en rouge ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('envoyer')).toEqual([['plutôt en rouge']])
    wrapper.unmount()
  })

  it('« c’est bon » propose les changements ; arrêter demande confirmation', async () => {
    const wrapper = monter()
    await bouton(wrapper, 'C’est bon : proposer ces changements')!.trigger('click')
    expect(wrapper.emitted('terminer')).toHaveLength(1)
    await bouton(wrapper, 'Arrêter la conversation')!.trigger('click')
    expect(wrapper.emitted('arreter')).toBeUndefined()
    expect(wrapper.text()).toContain('Rien de ce qu’ADA a fait ne sera ajouté au projet')
    expect(await violationsAccessibilite(document.body)).toEqual([])
    await bouton(wrapper, 'Oui, arrêter')!.trigger('click')
    expect(wrapper.emitted('arreter')).toHaveLength(1)
    wrapper.unmount()
  })

  it('pendant qu’ADA travaille : aucun champ ni bouton', () => {
    const wrapper = monter({ attendReponse: false })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
    wrapper.unmount()
  })
})
