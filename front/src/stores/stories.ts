import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import { STATUTS_ACTIFS, type Activite, type DetailStory, type ResumeStory } from '@/lib/story'

export const useStoriesStore = defineStore('stories', () => {
  const liste = ref<ResumeStory[]>([])
  const courante = ref<DetailStory | null>(null)
  const chargement = ref(false)
  const erreur = ref<string | null>(null)
  const erreurLancement = ref<string | null>(null)
  const activite = ref<Activite | null>(null)
  const erreurAction = ref<string | null>(null)

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
    if (courante.value?.numero !== numero) activite.value = null
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
      await chargerActivite(projet, numero)
    } catch (e) {
      erreurLancement.value = (e as Error).message
    }
  }

  async function chargerActivite(projet: string, numero: number): Promise<void> {
    try {
      activite.value = await api.lire<Activite>(`${chemin(projet)}/${numero}/activite`)
    } catch {
      /* activité indisponible : on garde la précédente */
    }
  }

  /** Relit la demande ouverte, son activité et la liste (statuts changés par l'assistant). */
  async function suivre(projet: string): Promise<void> {
    const numero = courante.value?.numero
    if (!numero) return
    await Promise.all([chargerActivite(projet, numero), charger(projet, true)])
    const resume = liste.value.find((s) => s.numero === numero)
    if (resume && resume.statut !== courante.value?.statut) await ouvrir(projet, numero)
    else if (courante.value?.numero === numero) {
      courante.value = await api.lire<DetailStory>(`${chemin(projet)}/${numero}`).catch(() => courante.value)
    }
  }

  async function agir(projet: string, numero: number, action: () => Promise<unknown>): Promise<void> {
    erreurAction.value = null
    try {
      await action()
      await ouvrir(projet, numero)
      await chargerActivite(projet, numero)
      await charger(projet, true)
    } catch (e) {
      erreurAction.value = (e as Error).message
    }
  }

  const validerPlan = (projet: string, numero: number) =>
    agir(projet, numero, () => api.envoyer(`${chemin(projet)}/${numero}/plan/valider`, {}))

  const relancer = (projet: string, numero: number) =>
    agir(projet, numero, () => api.envoyer(`${chemin(projet)}/${numero}/relancer`, {}))

  /** Réponse aux questions, ou modification demandée sur le plan. */
  const repondre = (projet: string, numero: number, texte: string) =>
    agir(projet, numero, () => api.envoyer(`${chemin(projet)}/${numero}/reponse`, { texte }))

  function fermer(): void {
    courante.value = null
    activite.value = null
  }

  return {
    liste,
    courante,
    active,
    chargement,
    erreur,
    erreurLancement,
    activite,
    erreurAction,
    charger,
    chargerActivite,
    suivre,
    validerPlan,
    relancer,
    ouvrir,
    lancer,
    repondre,
    fermer,
  }
})
