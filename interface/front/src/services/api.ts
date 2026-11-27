export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors: Record<string, string> = {},
  ) {
    super(message)
  }
}

async function callFetch<T>(filePath: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${filePath}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options,
  })
  const text = await response.text()
  let data: { message?: unknown; errors?: Record<string, string> } | null = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null // HTML error page (proxy): no JSON
  }
  if (!response.ok) {
    // ADA temporarily unavailable (restart, update): clear message, never a raw code.
    if ([502, 503, 504].includes(response.status)) {
      throw new ApiError(
        response.status,
        'ADA redémarre un instant. Votre action a peut-être déjà été prise en compte : vérifiez dans quelques secondes avant de réessayer.',
      )
    }
    const message =
      typeof data?.message === 'string' ? data.message : `Erreur ${response.status}`
    const errors = (data?.message as { errors?: Record<string, string> } | undefined)?.errors ?? data?.errors
    throw new ApiError(response.status, message, errors)
  }
  return data as T
}

export const api = {
  read: <T>(filePath: string) => callFetch<T>(filePath),
  send: <T>(filePath: string, body: unknown) =>
    callFetch<T>(filePath, { method: 'POST', body: JSON.stringify(body) }),
  replaceWith: <T>(filePath: string, body: unknown) =>
    callFetch<T>(filePath, { method: 'PUT', body: JSON.stringify(body) }),
  remove: <T>(filePath: string) => callFetch<T>(filePath, { method: 'DELETE' }),
}
