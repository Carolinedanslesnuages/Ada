import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ErreurApi } from '@/services/api'
import type { ErreursProjet, Modele, NouveauProjet, ResultatCreation } from '@/lib/projet'

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

  const modeles = ref<Modele[]>([])

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

  async function chargerModeles(): Promise<void> {
    if (modeles.value.length === 0) modeles.value = await api.lire<Modele[]>('/projets/modeles')
  }

  /** Crée le projet, l'ajoute en tête et le sélectionne ; renvoie les erreurs de validation éventuelles. */
  async function creer(
    projet: NouveauProjet,
  ): Promise<{ resultat: ResultatCreation } | { erreurs: ErreursProjet }> {
    try {
      const resultat = await api.envoyer<ResultatCreation>('/projets', projet)
      liste.value = [resultat.projet, ...liste.value.filter((p) => p.nom !== resultat.projet.nom)]
      nomCourant.value = resultat.projet.nom
      return { resultat }
    } catch (e) {
      if (e instanceof ErreurApi && (e.statut === 400 || e.statut === 409) && e.erreurs) {
        return { erreurs: e.erreurs as ErreursProjet }
      }
      throw e
    }
  }

  function choisir(nom: string): void {
    nomCourant.value = nom
  }

  return {
    liste,
    modeles,
    nomCourant,
    courant,
    chargement,
    erreur,
    charger,
    chargerModeles,
    creer,
    choisir,
  }
})

// Mise à jour à chaud en développement : sans cela, un onglet ouvert garde l'ancienne version du store.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useProjetsStore, import.meta.hot))
