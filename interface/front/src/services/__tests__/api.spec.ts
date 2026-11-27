import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError } from '../api'

const reply = (status: number, body: string) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }))

describe('ADA API client', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([502, 503, 504])('explains an unavailability simply (%i), without raw code', async (status) => {
    reply(status, '<html>Bad Gateway</html>')
    const error = await api.send('/projects/poc/versions/publish', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toMatch(/ADA redémarre un instant/)
    expect((error as ApiError).message).not.toMatch(/50\d/)
  })

  it('keeps the business message of the API and the validation errors', async () => {
    reply(409, JSON.stringify({ message: 'Aucune nouvelle version à publier' }))
    await expect(api.send('/x', {})).rejects.toThrow('Aucune nouvelle version à publier')
    reply(400, JSON.stringify({ message: { errors: { name: 'Nom pris' } } }))
    const error = (await api.send('/x', {}).catch((e: unknown) => e)) as ApiError
    expect(error.errors).toEqual({ name: 'Nom pris' })
  })
})
