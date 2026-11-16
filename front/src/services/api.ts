export class ErreurApi extends Error {
  constructor(
    public readonly statut: number,
    message: string,
    public readonly erreurs: Record<string, string> = {},
  ) {
    super(message)
  }
}

async function appeler<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const reponse = await fetch(`/api${chemin}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options,
  })
  const texte = await reponse.text()
  const donnees = texte ? JSON.parse(texte) : null
  if (!reponse.ok) {
    const message =
      typeof donnees?.message === 'string' ? donnees.message : `Erreur ${reponse.status}`
    throw new ErreurApi(reponse.status, message, donnees?.message?.erreurs ?? donnees?.erreurs)
  }
  return donnees as T
}

export const api = {
  lire: <T>(chemin: string) => appeler<T>(chemin),
  envoyer: <T>(chemin: string, corps: unknown) =>
    appeler<T>(chemin, { method: 'POST', body: JSON.stringify(corps) }),
}
