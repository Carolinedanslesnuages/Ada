import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ErreurApi } from '@/services/api'
import type { ErreursProjet, FamilleDeProjet, Modele, NouveauProjet, ResultatCreation, TypeDeProjet } from '@/lib/projet'

export interface Projet {
  /** Identifiant dans ADA : le nom, ou « compte~nom » pour un projet du compte personnel du PO. */
  id: string
  nom: string
  proprietaire: string
  compte: 'organisation' | 'personnel'
  description: string | null
  prive: boolean
  url: string
  misAJourLe: string | null
}

/** Dépôt existant que le PO peut faire reprendre par ADA (#37). */
export interface DepotAReprendre {
  id: string
  nom: string
  proprietaire: string
  compte: 'organisation' | 'personnel'
  description: string | null
  url: string
  /** PR de reprise déjà ouverte, en attente de fusion. */
  repriseEnCours: string | null
}

export interface ResultatReprise {
  pullRequest: string
  fichiers: string[]
}

export const useProjetsStore = defineStore('projets', () => {
  const liste = ref<Projet[]>([])
  const idCourant = ref<string | null>(null)
  const chargement = ref(false)
  const erreur = ref<string | null>(null)

  const modeles = ref<Modele[]>([])
  const types = ref<TypeDeProjet[]>([])
  const familles = ref<FamilleDeProjet[]>([])

  const courant = computed(() => liste.value.find((p) => p.id === idCourant.value) ?? null)

  async function charger(): Promise<void> {
    chargement.value = true
    erreur.value = null
    try {
      liste.value = await api.lire<Projet[]>('/projets')
      if (!courant.value) idCourant.value = liste.value[0]?.id ?? null
    } catch (e) {
      erreur.value = (e as Error).message
    } finally {
      chargement.value = false
    }
  }

  async function chargerModeles(): Promise<void> {
    if (modeles.value.length > 0) return
    const catalogue = await api.lire<{ familles: FamilleDeProjet[]; types: TypeDeProjet[]; modeles: Modele[] }>(
      '/projets/modeles',
    )
    familles.value = catalogue.familles
    types.value = catalogue.types
    modeles.value = catalogue.modeles
  }

  /** Crée le projet, l'ajoute en tête et le sélectionne ; renvoie les erreurs de validation éventuelles. */
  async function creer(
    projet: NouveauProjet,
  ): Promise<{ resultat: ResultatCreation } | { erreurs: ErreursProjet }> {
    try {
      const resultat = await api.envoyer<ResultatCreation>('/projets', projet)
      liste.value = [resultat.projet, ...liste.value.filter((p) => p.id !== resultat.projet.id)]
      idCourant.value = resultat.projet.id
      return { resultat }
    } catch (e) {
      if (e instanceof ErreurApi && (e.statut === 400 || e.statut === 409) && e.erreurs) {
        return { erreurs: e.erreurs as ErreursProjet }
      }
      throw e
    }
  }

  function choisir(id: string): void {
    idCourant.value = id
  }

  function aReprendre(): Promise<DepotAReprendre[]> {
    return api.lire<DepotAReprendre[]>('/projets/a-reprendre')
  }

  /** ADA ouvre la PR de reprise ; le projet apparaît dans la liste une fois qu'elle est fusionnée. */
  function reprendre(depot: string, modele: string, dsfr: boolean): Promise<ResultatReprise> {
    return api.envoyer<ResultatReprise>('/projets/reprendre', { depot, modele, dsfr })
  }

  return {
    liste,
    modeles,
    types,
    familles,
    idCourant,
    courant,
    chargement,
    erreur,
    charger,
    chargerModeles,
    creer,
    choisir,
    aReprendre,
    reprendre,
  }
})

// Mise à jour à chaud en développement : sans cela, un onglet ouvert garde l'ancienne version du store.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useProjetsStore, import.meta.hot))
