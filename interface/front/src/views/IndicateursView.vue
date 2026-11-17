<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/services/api'
import { duree, type Indicateurs } from '@/lib/indicateurs'

const indicateurs = ref<Indicateurs | null>(null)
const erreur = ref<string | null>(null)

onMounted(async () => {
  try {
    indicateurs.value = await api.lire<Indicateurs>('/indicateurs')
  } catch (e) {
    erreur.value = (e as Error).message
  }
})

const chiffres = computed(() =>
  indicateurs.value
    ? [
        { titre: 'Projets actifs dans ADA', valeur: String(indicateurs.value.projets) },
        { titre: 'Stories livrées', valeur: String(indicateurs.value.storiesLivrees) },
        { titre: 'Temps moyen du lancement à la livraison', valeur: duree(indicateurs.value.dureeMoyenneMinutes) },
      ]
    : [],
)
/** Tous les projets passés par ADA : d'où ils viennent, ce qu'ils sont devenus. */
const historique = computed(() => {
  const bilan = indicateurs.value?.historique
  if (!bilan) return []
  return [
    ['Projets passés par ADA', String(bilan.total)],
    ['dont créés avec ADA', String(bilan.crees)],
    ['dont repris (créés ailleurs)', String(bilan.repris)],
    ['Actifs dans ADA', String(bilan.actifs)],
    ['Archivés', String(bilan.archives)],
    ['Retirés d’ADA (reprise annulée, désynchronisés)', String(bilan.retires)],
    ['Supprimés de GitHub', String(bilan.supprimes)],
  ]
})
const entetes = ['Projet', 'Stories livrées', 'Temps moyen de livraison']
const lignes = computed(() =>
  (indicateurs.value?.parProjet ?? []).map((projet) => [
    projet.nom,
    String(projet.storiesLivrees),
    duree(projet.dureeMoyenneMinutes),
  ]),
)
</script>

<template>
  <h1>Indicateurs</h1>
  <p>
    Ce qu’ADA a permis de livrer, calculé à partir de GitHub (stories fermées et historique de
    leurs statuts). Mis à jour toutes les 5 minutes au plus.
  </p>
  <DsfrAlert v-if="erreur" type="error" title="Indicateurs indisponibles" :description="erreur" />
  <p v-else-if="!indicateurs" role="status">Calcul des indicateurs…</p>
  <template v-else>
    <h2 class="fr-h4">Sur l’ensemble des projets</h2>
    <ul class="fr-grid-row fr-grid-row--gutters indicateurs">
      <li v-for="chiffre in chiffres" :key="chiffre.titre" class="fr-col-12 fr-col-sm-6 fr-col-lg-4">
        <div class="fr-callout fr-mb-0 indicateurs__carte">
          <p class="fr-callout__title fr-h2 fr-mb-1w">{{ chiffre.valeur }}</p>
          <p class="fr-callout__text fr-text--sm">{{ chiffre.titre }}</p>
        </div>
      </li>
    </ul>
    <p class="fr-text--xs fr-mt-2w">
      Le temps de livraison ne compte que les stories lancées depuis ADA.
    </p>
    <h2 class="fr-h4 fr-mt-4w">Tous les projets passés par ADA</h2>
    <p class="fr-text--sm">
      Y compris ceux archivés, retirés d’ADA ou supprimés depuis : ADA garde la trace de chaque
      projet créé ou repris.
    </p>
    <DsfrTable title="Projets passés par ADA et leur devenir" :headers="['', 'Nombre']" :rows="historique" />
    <p class="fr-text--xs">
      Les projets d’avant ce suivi sont repris d’après leur aperçu dans ADA ; leur origine (créé ou
      repris) est alors comptée comme « créé ».
    </p>

    <h2 class="fr-h4 fr-mt-4w">Par projet</h2>
    <DsfrTable v-if="lignes.length" title="Indicateurs par projet" :headers="entetes" :rows="lignes" />
    <p v-else>Aucun projet pour l’instant.</p>
  </template>
</template>

<style scoped>
.indicateurs {
  list-style: none;
  padding: 0;
}
.indicateurs__carte {
  height: 100%;
}
</style>
