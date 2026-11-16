import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ErreurApi } from '@/services/api'
import type { DetailStory, ErreursStory, Message, NouvelleStory, ResumeStory } from '@/lib/story'

export const useStoriesStore = defineStore('stories', () => {
  const liste = ref<ResumeStory[]>([])
  const courante = ref<DetailStory | null>(null)
  const chargement = ref(false)
  const erreur = ref<string | null>(null)

  const chemin = (projet: string) => `/projets/${encodeURIComponent(projet)}/stories`

  async function charger(projet: string): Promise<void> {
    chargement.value = true
    erreur.value = null
    courante.value = null
    try {
      liste.value = await api.lire<ResumeStory[]>(chemin(projet))
    } catch (e) {
      liste.value = []
      erreur.value = (e as Error).message
    } finally {
      chargement.value = false
    }
  }

  async function ouvrir(projet: string, numero: number): Promise<void> {
    erreur.value = null
    try {
      courante.value = await api.lire<DetailStory>(`${chemin(projet)}/${numero}`)
    } catch (e) {
      erreur.value = (e as Error).message
    }
  }

  /** Crée la story ; renvoie les erreurs de validation de l'API s'il y en a. */
  async function creer(projet: string, story: NouvelleStory): Promise<ErreursStory | null> {
    try {
      const creee = await api.envoyer<ResumeStory>(chemin(projet), story)
      liste.value = [creee, ...liste.value]
      await ouvrir(projet, creee.numero)
      return null
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 400 && e.erreurs) return e.erreurs as ErreursStory
      throw e
    }
  }

  async function repondre(projet: string, numero: number, texte: string): Promise<void> {
    const message = await api.envoyer<Message>(`${chemin(projet)}/${numero}/messages`, { texte })
    if (courante.value?.numero === numero) courante.value.messages.push(message)
  }

  function fermer(): void {
    courante.value = null
  }

  return { liste, courante, chargement, erreur, charger, ouvrir, creer, repondre, fermer }
})
