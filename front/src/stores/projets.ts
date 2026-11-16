import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/services/api'

export interface Projet {
  nom: string
  description: string | null
  prive: boolean
  url: string
  misAJourLe: string | null
}

export const useProjetsStore = defineStore('projets', () => {
  const liste = ref<Projet[]>([])
  const nomCourant = ref<string | null>(null)
  const chargement = ref(false)
  const erreur = ref<string | null>(null)

  const courant = computed(() => liste.value.find((p) => p.nom === nomCourant.value) ?? null)

  async function charger(): Promise<void> {
    chargement.value = true
    erreur.value = null
    try {
      liste.value = await api.lire<Projet[]>('/projets')
      if (!courant.value) nomCourant.value = liste.value[0]?.nom ?? null
    } catch (e) {
      erreur.value = (e as Error).message
    } finally {
      chargement.value = false
    }
  }

  function choisir(nom: string): void {
    nomCourant.value = nom
  }

  return { liste, nomCourant, courant, chargement, erreur, charger, choisir }
})
