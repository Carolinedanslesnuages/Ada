import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStoriesStore } from '../stories'
import { api, ErreurApi } from '@/services/api'
import type { ResumeStory } from '@/lib/story'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: {
    lire: vi.fn<(chemin: string) => Promise<unknown>>(),
    envoyer: vi.fn<(chemin: string, corps: unknown) => Promise<unknown>>(),
  },
}))
const lire = vi.mocked(api.lire)
const envoyer = vi.mocked(api.envoyer)

const resume = (numero: number, extra: Partial<ResumeStory> = {}): ResumeStory => ({
  numero,
  type: 'story',
  titre: `Story ${numero}`,
  statut: 'nouvelle',
  creeeLe: '2026-11-16T10:00:00Z',
  url: 'https://github.com/x',
  prete: true,
  raison: null,
  ...extra,
})

const detail = (numero: number, extra: Partial<ResumeStory> = {}) => ({
  ...resume(numero, extra),
  contenu: null,
  contenuBug: null,
  texteBrut: '',
  messages: [],
})

describe('Store des stories', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    lire.mockReset()
    envoyer.mockReset()
  })

  it('charge les stories écrites dans GitHub pour le projet choisi', async () => {
    lire.mockResolvedValue([resume(1)])
    const store = useStoriesStore()
    await store.charger('mon-poc')
    expect(lire).toHaveBeenCalledWith('/projets/mon-poc/stories')
    expect(store.liste).toHaveLength(1)
  })

  it('repère la demande qui occupe le projet', () => {
    const store = useStoriesStore()
    store.liste = [resume(3), resume(2, { statut: 'questions' }), resume(1, { statut: 'livree' })]
    expect(store.active?.numero).toBe(2)
  })

  it('lance une story puis relit la liste et la story', async () => {
    const store = useStoriesStore()
    envoyer.mockResolvedValue(resume(2, { statut: 'en-cours' }))
    lire.mockImplementation(async (chemin: string) =>
      chemin.endsWith('/stories') ? [resume(2, { statut: 'en-cours' })] : detail(2, { statut: 'en-cours' }),
    )
    await store.lancer('mon-poc', 2)
    expect(envoyer).toHaveBeenCalledWith('/projets/mon-poc/stories/2/lancer', {})
    expect(store.liste[0]?.statut).toBe('en-cours')
    expect(store.courante?.statut).toBe('en-cours')
    expect(store.erreurLancement).toBeNull()
  })

  it('garde le message de refus du lancement (une autre est en cours)', async () => {
    const store = useStoriesStore()
    envoyer.mockRejectedValue(new ErreurApi(409, 'La demande #1 « A » est en cours : une seule demande à la fois'))
    await store.lancer('mon-poc', 2)
    expect(store.erreurLancement).toMatch(/une seule demande à la fois/)
  })

  it('ajoute la réponse du PO au fil de la story ouverte', async () => {
    const store = useStoriesStore()
    store.courante = detail(3)
    envoyer.mockResolvedValue({ id: 5, auteur: 'po', avatar: null, texte: 'Oui', le: 'x' })
    await store.repondre('mon-poc', 3, 'Oui')
    expect(envoyer).toHaveBeenCalledWith('/projets/mon-poc/stories/3/messages', { texte: 'Oui' })
    expect(store.courante.messages.map((m) => m.texte)).toEqual(['Oui'])
  })
})
