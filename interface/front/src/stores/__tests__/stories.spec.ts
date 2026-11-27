import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStoriesStore } from '../stories'
import { api, ApiError } from '@/services/api'
import type { StoryDetail, StorySummary } from '@/lib/story'

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  api: {
    read: vi.fn<(filePath: string) => Promise<unknown>>(),
    send: vi.fn<(filePath: string, body: unknown) => Promise<unknown>>(),
  },
}))
const read = vi.mocked(api.read)
const send = vi.mocked(api.send)

const summary = (number: number, extra: Partial<StorySummary> = {}): StorySummary => ({
  number,
  type: 'story',
  title: `Story ${number}`,
  status: 'new',
  createdAt: '2026-11-16T10:00:00Z',
  closedAt: null,
  url: 'https://github.com/x',
  ready: true,
  reason: null,
  ...extra,
})

const detail = (number: number, extra: Partial<StoryDetail> = {}) => ({
  ...summary(number, extra),
  assignees: [],
  content: null,
  bugContent: null,
  freeContent: null,
  rawText: '',
  messages: [],
})

describe('Stories store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    read.mockReset()
    send.mockReset()
  })

  it('loads the stories written in GitHub for the chosen project', async () => {
    read.mockResolvedValue([summary(1)])
    const store = useStoriesStore()
    await store.load('mon-poc')
    expect(read).toHaveBeenCalledWith('/projects/mon-poc/stories')
    expect(store.list).toHaveLength(1)
  })

  it('spots the request that keeps the project busy', () => {
    const store = useStoriesStore()
    store.list = [summary(3), summary(2, { status: 'questions' }), summary(1, { status: 'delivered' })]
    expect(store.active?.number).toBe(2)
  })

  it('launches a story then reads the list and the story again; without an open request, reads it first to get its fingerprint', async () => {
    const store = useStoriesStore()
    send.mockResolvedValue(summary(2, { status: 'in-progress' }))
    read.mockImplementation(async (filePath: string) =>
      filePath.endsWith('/stories') ? [summary(2, { status: 'in-progress' })] : detail(2, { status: 'in-progress', fingerprint: 'lue-avant-le-lancement' }),
    )
    await store.launch('mon-poc', 2)
    expect(send).toHaveBeenCalledWith('/projects/mon-poc/stories/2/launch', { fingerprint: 'lue-avant-le-lancement' })
    expect(read.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]!)
    expect(store.list[0]?.status).toBe('in-progress')
    expect(store.current?.status).toBe('in-progress')
    expect(store.launchError).toBeNull()
  })

  it('sends back at launch the fingerprint of the displayed request', async () => {
    const store = useStoriesStore()
    store.current = detail(2, { fingerprint: 'empreinte-affichee' })
    send.mockResolvedValue(summary(2, { status: 'in-progress' }))
    read.mockImplementation(async (filePath: string) => (filePath.endsWith('/stories') ? [summary(2)] : detail(2)))
    await store.launch('mon-poc', 2)
    expect(send).toHaveBeenCalledWith('/projects/mon-poc/stories/2/launch', { fingerprint: 'empreinte-affichee' })
  })

  it('request modified on GitHub in the meantime: shows the new version and keeps the message', async () => {
    const store = useStoriesStore()
    store.current = detail(2, { fingerprint: 'ancienne', title: 'Ancien titre' })
    send.mockRejectedValue(new ApiError(409, 'Cette demande a été modifiée sur GitHub depuis que vous l’avez ouverte. Relisez-la, puis lancez-la de nouveau.'))
    read.mockResolvedValue(detail(2, { fingerprint: 'new', title: 'Nouveau titre' }))
    await store.launch('mon-poc', 2)
    expect(store.current?.title).toBe('Nouveau titre')
    expect(store.launchError).toMatch(/modifiée sur GitHub/)
  })

  it('keeps the launch refusal message (another one is in progress)', async () => {
    const store = useStoriesStore()
    send.mockRejectedValue(new ApiError(409, 'La demande #1 « A » est en cours : une seule demande à la fois'))
    await store.launch('mon-poc', 2)
    expect(store.launchError).toMatch(/une seule demande à la fois/)
  })

  it('approves the plan then reads the request and its activity again', async () => {
    const store = useStoriesStore()
    send.mockResolvedValue({ ok: true })
    read.mockImplementation(async (filePath: string) =>
      filePath.endsWith('/activity')
        ? { phase: 'implementation', inProgress: true, start: null, log: [], error: null, pullRequest: null }
        : filePath.endsWith('/stories')
          ? [summary(2, { status: 'in-progress' })]
          : detail(2, { status: 'in-progress' }),
    )
    await store.approvePlan('mon-poc', 2)
    expect(send).toHaveBeenCalledWith('/projects/mon-poc/stories/2/plan/approve', {})
    expect(store.activity?.inProgress).toBe(true)
    expect(store.current?.status).toBe('in-progress')
  })

  it('sends the PO\'s answer to ADA', async () => {
    const store = useStoriesStore()
    send.mockResolvedValue({ ok: true })
    read.mockImplementation(async (filePath: string) => (filePath.endsWith('/stories') ? [] : detail(3)))
    await store.reply('mon-poc', 3, 'Oui')
    expect(send).toHaveBeenCalledWith('/projects/mon-poc/stories/3/response', { text: 'Oui' })
  })

  it('merges the request: delivered, it moves to “Déjà livrées” and its detail closes', async () => {
    const store = useStoriesStore()
    store.current = detail(2, { status: 'in-review' })
    send.mockResolvedValue({ pullRequest: { number: 3, url: 'u', state: 'merged' }, checks: [], mergeable: false, reason: 'Déjà fusionnée' })
    read.mockImplementation(async (filePath: string) => (filePath.endsWith('/stories') ? [summary(2, { status: 'delivered' })] : detail(2, { status: 'delivered' })))
    await store.merge('mon-poc', 2)
    expect(send).toHaveBeenCalledWith('/projects/mon-poc/stories/2/merge', {})
    expect(store.active).toBeNull()
    expect(store.current).toBeNull()
    expect(store.todo).toEqual([])
    expect(store.delivered.map((story) => story.number)).toEqual([2])
  })

  it('deferred merge (branch updated, checks rerun): the request stays open', async () => {
    const store = useStoriesStore()
    store.current = detail(2, { status: 'in-review' })
    send.mockResolvedValue({ pullRequest: { number: 3, url: 'u', state: 'open' }, checks: [], mergeable: false, reason: 'Le projet a évolué' })
    read.mockImplementation(async (filePath: string) =>
      filePath.endsWith('/stories') ? [summary(2, { status: 'in-review' })] : filePath.endsWith('/activity') ? null : detail(2, { status: 'in-review' }),
    )
    await store.merge('mon-poc', 2)
    expect(store.current?.number).toBe(2)
    expect(store.verification?.reason).toBe('Le projet a évolué')
  })

  it('separates what is left to do from the delivered ones, most recent first', () => {
    const store = useStoriesStore()
    store.list = [
      summary(1, { status: 'delivered', closedAt: '2026-11-10T10:00:00Z' }),
      summary(2, { status: 'in-progress' }),
      summary(3, { status: 'delivered', closedAt: '2026-11-12T10:00:00Z' }),
      summary(4),
    ]
    expect(store.todo.map((story) => story.number)).toEqual([2, 4])
    expect(store.delivered.map((story) => story.number)).toEqual([3, 1])
  })

  it('wild mode: sends the prompt, then opens the created request', async () => {
    const store = useStoriesStore()
    send.mockResolvedValue(summary(9, { type: 'free', status: 'in-progress' }))
    read.mockImplementation(async (filePath: string) =>
      filePath.endsWith('/stories') ? [summary(9, { type: 'free', status: 'in-progress' })] : filePath.endsWith('/activity') ? null : detail(9, { type: 'free', status: 'in-progress' }),
    )
    expect(await store.submitPrompt('mon-poc', 'Mets le titre en bleu')).toBeNull()
    expect(send).toHaveBeenCalledWith('/projects/mon-poc/stories/prompt', { text: 'Mets le titre en bleu' })
    expect(store.current?.number).toBe(9)
  })

  it('wild mode: returns the refusal (another request in progress)', async () => {
    const store = useStoriesStore()
    send.mockRejectedValue(new ApiError(409, 'La demande #1 « A » est en cours : une seule demande à la fois'))
    expect(await store.submitPrompt('mon-poc', 'Mets le titre en bleu')).toMatch(/une seule demande à la fois/)
  })

  it('keeps the message if the action is refused', async () => {
    const store = useStoriesStore()
    send.mockRejectedValue(new ApiError(409, 'Aucun plan n’attend votre validation'))
    await store.approvePlan('mon-poc', 2)
    expect(store.actionError).toBe('Aucun plan n’attend votre validation')
  })
})
