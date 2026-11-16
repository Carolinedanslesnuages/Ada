import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import { STATUTS_ACTIFS, type DetailStory, type Message, type ResumeStory } from '@/lib/story'

export const useStoriesStore = defineStore('stories', () => {
  const liste = ref<ResumeStory[]>([])
  const courante = ref<DetailStory | null>(null)
  const chargement = ref(false)
  const erreur = ref<string | null>(null)
  const erreurLancement = ref<string | null>(null)

  /** La demande qui occupe le projet : tant qu'elle existe, on n'en lance pas d'autre. */
  const active = computed(() => liste.value.find((s) => STATUTS_ACTIFS.includes(s.statut)) ?? null)

  const chemin = (projet: string) => `/projets/${encodeURIComponent(projet)}/stories`

  async function charger(projet: string, garderCourante = false): Promise<void> {
    chargement.value = !garderCourante
    erreur.value = null
    if (!garderCourante) courante.value = null
    try {
      liste.value = await api.lire<ResumeStory[]>(chemin(projet))
    } catch (e) {
      if (!garderCourante) liste.value = []
      erreur.value = (e as Error).message
    } finally {
      chargement.value = false
    }
  }

  async function ouvrir(projet: string, numero: number): Promise<void> {
    erreur.value = null
    erreurLancement.value = null
    try {
      courante.value = await api.lire<DetailStory>(`${chemin(projet)}/${numero}`)
    } catch (e) {
      erreur.value = (e as Error).message
    }
  }

  async function lancer(projet: string, numero: number): Promise<void> {
    erreurLancement.value = null
    try {
      await api.envoyer<ResumeStory>(`${chemin(projet)}/${numero}/lancer`, {})
      await charger(projet, true)
      await ouvrir(projet, numero)
    } catch (e) {
      erreurLancement.value = (e as Error).message
    }
  }

  async function repondre(projet: string, numero: number, texte: string): Promise<void> {
    const message = await api.envoyer<Message>(`${chemin(projet)}/${numero}/messages`, { texte })
    if (courante.value?.numero === numero) courante.value.messages.push(message)
  }

  function fermer(): void {
    courante.value = null
  }

  return {
    liste,
    courante,
    active,
    chargement,
    erreur,
    erreurLancement,
    charger,
    ouvrir,
    lancer,
    repondre,
    fermer,
  }
})
