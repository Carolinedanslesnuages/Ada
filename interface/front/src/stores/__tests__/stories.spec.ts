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
  contenuLibre: null,
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

  it('valide le plan puis relit la demande et son activité', async () => {
    const store = useStoriesStore()
    envoyer.mockResolvedValue({ ok: true })
    lire.mockImplementation(async (chemin: string) =>
      chemin.endsWith('/activite')
        ? { phase: 'realisation', enCours: true, debut: null, journal: [], erreur: null, pullRequest: null }
        : chemin.endsWith('/stories')
          ? [resume(2, { statut: 'en-cours' })]
          : detail(2, { statut: 'en-cours' }),
    )
    await store.validerPlan('mon-poc', 2)
    expect(envoyer).toHaveBeenCalledWith('/projets/mon-poc/stories/2/plan/valider', {})
    expect(store.activite?.enCours).toBe(true)
    expect(store.courante?.statut).toBe('en-cours')
  })

  it('envoie la réponse du PO à l’assistant', async () => {
    const store = useStoriesStore()
    envoyer.mockResolvedValue({ ok: true })
    lire.mockImplementation(async (chemin: string) => (chemin.endsWith('/stories') ? [] : detail(3)))
    await store.repondre('mon-poc', 3, 'Oui')
    expect(envoyer).toHaveBeenCalledWith('/projets/mon-poc/stories/3/reponse', { texte: 'Oui' })
  })

  it('fusionne la demande et garde le résultat de la vérification', async () => {
    const store = useStoriesStore()
    store.courante = detail(2, { statut: 'en-verification' })
    envoyer.mockResolvedValue({ pullRequest: { numero: 3, url: 'u', etat: 'fusionnee' }, controles: [], fusionnable: false, raison: 'Déjà fusionnée' })
    lire.mockImplementation(async (chemin: string) => (chemin.endsWith('/stories') ? [resume(2, { statut: 'livree' })] : detail(2, { statut: 'livree' })))
    await store.fusionner('mon-poc', 2)
    expect(envoyer).toHaveBeenCalledWith('/projets/mon-poc/stories/2/fusionner', {})
    expect(store.verification?.pullRequest?.etat).toBe('fusionnee')
    expect(store.active).toBeNull()
  })

  it('mode sauvage : envoie le prompt, puis ouvre la demande créée', async () => {
    const store = useStoriesStore()
    envoyer.mockResolvedValue(resume(9, { type: 'libre', statut: 'en-cours' }))
    lire.mockImplementation(async (chemin: string) =>
      chemin.endsWith('/stories') ? [resume(9, { type: 'libre', statut: 'en-cours' })] : chemin.endsWith('/activite') ? null : detail(9, { type: 'libre', statut: 'en-cours' }),
    )
    expect(await store.prompter('mon-poc', 'Mets le titre en bleu')).toBeNull()
    expect(envoyer).toHaveBeenCalledWith('/projets/mon-poc/stories/prompt', { texte: 'Mets le titre en bleu' })
    expect(store.courante?.numero).toBe(9)
  })

  it('mode sauvage : renvoie le refus (une autre demande en cours)', async () => {
    const store = useStoriesStore()
    envoyer.mockRejectedValue(new ErreurApi(409, 'La demande #1 « A » est en cours : une seule demande à la fois'))
    expect(await store.prompter('mon-poc', 'Mets le titre en bleu')).toMatch(/une seule demande à la fois/)
  })

  it('garde le message si l’action est refusée', async () => {
    const store = useStoriesStore()
    envoyer.mockRejectedValue(new ErreurApi(409, 'Aucun plan n’attend votre validation'))
    await store.validerPlan('mon-poc', 2)
    expect(store.erreurAction).toBe('Aucun plan n’attend votre validation')
  })
})
