import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStoriesStore } from '../stories'
import { api, ErreurApi } from '@/services/api'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: { lire: vi.fn<(chemin: string) => Promise<unknown>>(), envoyer: vi.fn<(chemin: string, corps: unknown) => Promise<unknown>>() },
}))
const lire = vi.mocked(api.lire)
const envoyer = vi.mocked(api.envoyer)

const resume = (numero: number) => ({
  numero,
  type: 'story' as const,
  titre: `Story ${numero}`,
  statut: 'nouvelle' as const,
  creeeLe: '2026-11-16T10:00:00Z',
  url: 'https://github.com/x',
})

describe('Store des stories', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    lire.mockReset()
    envoyer.mockReset()
  })

  it('charge les stories du projet choisi', async () => {
    lire.mockResolvedValue([resume(1)])
    const store = useStoriesStore()
    await store.charger('mon-poc')
    expect(lire).toHaveBeenCalledWith('/projets/mon-poc/stories')
    expect(store.liste).toHaveLength(1)
  })

  it('ajoute la story créée en tête de liste et l’ouvre', async () => {
    envoyer.mockResolvedValue(resume(9))
    lire.mockResolvedValue({ ...resume(9), contenu: null, contenuBug: null, texteBrut: '', messages: [] })
    const store = useStoriesStore()
    store.liste = [resume(1)]
    const erreurs = await store.creer('mon-poc', {
      titre: 'Titre',
      role: 'agent',
      besoin: 'voir',
      benefice: 'gagner du temps',
      criteres: ['un critère'],
    })
    expect(erreurs).toBeNull()
    expect(store.liste.map((s) => s.numero)).toEqual([9, 1])
    expect(store.courante?.numero).toBe(9)
  })

  it('renvoie les erreurs de validation de l’API', async () => {
    envoyer.mockRejectedValue(new ErreurApi(400, 'Bad Request', { criteres: 'trop de critères' }))
    const store = useStoriesStore()
    const erreurs = await store.creer('mon-poc', {
      titre: 'Titre',
      role: 'agent',
      besoin: 'voir',
      benefice: 'gagner du temps',
      criteres: ['a', 'b', 'c', 'd', 'e'],
    })
    expect(erreurs).toEqual({ criteres: 'trop de critères' })
  })

  it('ajoute la réponse du PO au fil de la story ouverte', async () => {
    const store = useStoriesStore()
    store.courante = { ...resume(3), contenu: null, contenuBug: null, texteBrut: '', messages: [] }
    envoyer.mockResolvedValue({ id: 5, auteur: 'po', avatar: null, texte: 'Oui', le: 'x' })
    await store.repondre('mon-poc', 3, 'Oui')
    expect(envoyer).toHaveBeenCalledWith('/projets/mon-poc/stories/3/messages', { texte: 'Oui' })
    expect(store.courante.messages.map((m) => m.texte)).toEqual(['Oui'])
  })
  it('envoie un signalement sur la route dédiée et l’ajoute en tête', async () => {
    envoyer.mockResolvedValue({ ...resume(12), type: 'bug' })
    lire.mockResolvedValue({ ...resume(12), type: 'bug', contenu: null, contenuBug: null, texteBrut: '', messages: [] })
    const store = useStoriesStore()
    const bug = { titre: 'Liste vide', constate: 'vide', attendu: 'pleine', etapes: '1. ouvrir', ecran: '' }
    expect(await store.signaler('mon-poc', bug)).toBeNull()
    expect(envoyer).toHaveBeenCalledWith('/projets/mon-poc/stories/signalements', bug)
    expect(store.liste[0]?.type).toBe('bug')
  })
})
