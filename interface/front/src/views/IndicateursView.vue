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

/** Les chiffres clés, en tête de page. */
const chiffres = computed(() =>
  indicateurs.value
    ? [
        { titre: 'Projets passés par ADA', valeur: String(indicateurs.value.historique.total) },
        { titre: 'Projets actifs dans ADA', valeur: String(indicateurs.value.projets) },
        { titre: 'Stories livrées', valeur: String(indicateurs.value.storiesLivrees) },
        { titre: 'Temps moyen du lancement à la livraison', valeur: duree(indicateurs.value.dureeMoyenneMinutes) },
      ]
    : [],
)

/** Ce que sont devenus les projets : une barre (décorative) et sa légende en texte. */
const devenir = computed(() => {
  const bilan = indicateurs.value?.historique
  if (!bilan) return []
  return [
    { cle: 'actifs', libelle: 'Actifs dans ADA', nombre: bilan.actifs },
    { cle: 'archives', libelle: 'Archivés', nombre: bilan.archives },
    { cle: 'retires', libelle: 'Retirés d’ADA (reprise annulée, désynchronisés)', nombre: bilan.retires },
    { cle: 'supprimes', libelle: 'Supprimés de GitHub', nombre: bilan.supprimes },
  ].map((etat) => ({ ...etat, part: bilan.total ? (etat.nombre / bilan.total) * 100 : 0 }))
})

const entetes = ['Projet', 'Stories livrées', 'Temps moyen de livraison']
const lignes = computed(() =>
  (indicateurs.value?.parProjet ?? []).map((projet) => [projet.nom, String(projet.storiesLivrees), duree(projet.dureeMoyenneMinutes)]),
)
</script>

<template>
  <div class="fr-container fr-px-0">
    <h1>Indicateurs</h1>
    <p class="fr-text--lead">Ce qu’ADA a permis de livrer, calculé à partir de GitHub. Mis à jour toutes les 5 minutes au plus.</p>

    <DsfrAlert v-if="erreur" type="error" title="Indicateurs indisponibles" :description="erreur" />

    <!-- Pendant le calcul (plusieurs secondes) : la forme de la page, sans contenu. -->
    <div v-else-if="!indicateurs" class="squelette" aria-busy="true">
      <p class="fr-sr-only" role="status">Calcul des indicateurs…</p>
      <div class="fr-grid-row fr-grid-row--gutters" aria-hidden="true">
        <div v-for="rang in 4" :key="rang" class="fr-col-12 fr-col-sm-6 fr-col-lg-3">
          <div class="squelette__carte" />
        </div>
      </div>
      <div class="squelette__ligne squelette__ligne--titre fr-mt-5w" aria-hidden="true" />
      <div class="squelette__barre" aria-hidden="true" />
      <div class="squelette__ligne squelette__ligne--titre fr-mt-5w" aria-hidden="true" />
      <div v-for="rang in 3" :key="rang" class="squelette__ligne" aria-hidden="true" />
    </div>

    <template v-else>
      <ul class="fr-grid-row fr-grid-row--gutters chiffres">
        <li v-for="chiffre in chiffres" :key="chiffre.titre" class="fr-col-12 fr-col-sm-6 fr-col-lg-3">
          <div class="chiffres__carte">
            <p class="chiffres__valeur">{{ chiffre.valeur }}</p>
            <p class="chiffres__titre">{{ chiffre.titre }}</p>
          </div>
        </li>
      </ul>
      <p class="fr-text--xs fr-mt-1w">Le temps de livraison ne compte que les stories lancées depuis ADA.</p>

      <h2 class="fr-h4 fr-mt-5w">Ce que sont devenus les projets</h2>
      <p class="fr-text--sm">
        {{ indicateurs.historique.total }} projets passés par ADA :
        {{ indicateurs.historique.crees }} créés avec ADA, {{ indicateurs.historique.repris }} repris (créés ailleurs).
        ADA garde la trace de chaque projet, même archivé ou supprimé depuis.
      </p>
      <div v-if="indicateurs.historique.total" class="devenir" aria-hidden="true">
        <span
          v-for="etat in devenir.filter((element) => element.nombre)"
          :key="etat.cle"
          :class="['devenir__part', `devenir__part--${etat.cle}`]"
          :style="{ width: `${etat.part}%` }"
        />
      </div>
      <ul class="legende fr-mt-2w">
        <li v-for="etat in devenir" :key="etat.cle" class="legende__element">
          <span :class="['legende__pastille', `devenir__part--${etat.cle}`]" aria-hidden="true" />
          <strong class="legende__nombre">{{ etat.nombre }}</strong> {{ etat.libelle }}
        </li>
      </ul>
      <p class="fr-text--xs">
        Les projets d’avant ce suivi sont repris d’après leur aperçu dans ADA ; leur origine est alors
        comptée comme « créé avec ADA ».
      </p>

      <h2 class="fr-h4 fr-mt-5w">Par projet actif</h2>
      <DsfrTable v-if="lignes.length" class="tableau-pleine-largeur" title="Indicateurs par projet" no-caption :headers="entetes" :rows="lignes" />
      <p v-else>Aucun projet actif pour l’instant.</p>
    </template>
  </div>
</template>

<style scoped>
.chiffres {
  list-style: none;
  padding: 0;
  margin: 0;
}
.chiffres__carte {
  height: 100%;
  padding: 1.5rem;
  background: var(--background-alt-blue-france);
  border-bottom: 4px solid var(--border-plain-blue-france);
}
.chiffres__valeur {
  margin: 0 0 0.25rem;
  font-size: 2.5rem;
  line-height: 1.1;
  font-weight: 700;
  color: var(--text-title-blue-france);
}
.chiffres__titre {
  margin: 0;
  font-size: 0.875rem;
}

/* Barre du devenir des projets : décorative, la légende donne les mêmes informations en texte. */
.devenir {
  display: flex;
  height: 1.5rem;
  border-radius: 0.25rem;
  overflow: hidden;
  background: var(--background-contrast-grey);
}
.devenir__part {
  display: block;
  min-width: 0.5rem;
}
.devenir__part--actifs {
  background: var(--background-flat-success);
}
.devenir__part--archives {
  background: var(--background-flat-grey);
}
.devenir__part--retires {
  background: var(--background-flat-warning);
}
.devenir__part--supprimes {
  background: var(--background-flat-error);
}
.legende {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2rem;
}
.legende__element {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.legende__pastille {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border-radius: 0.2rem;
}
.legende__nombre {
  font-size: 1.25rem;
}

/* Le DSFR enveloppe le tableau dans plusieurs boîtes à la largeur du contenu : toutes en pleine largeur. */
.tableau-pleine-largeur,
.tableau-pleine-largeur :deep(.fr-table__wrapper),
.tableau-pleine-largeur :deep(.fr-table__container),
.tableau-pleine-largeur :deep(.fr-table__content),
.tableau-pleine-largeur :deep(table) {
  width: 100%;
}
/* Le DSFR affiche le tableau en bloc (pour le faire défiler) : ses lignes ne s'étirent pas. */
.tableau-pleine-largeur :deep(table) {
  display: table;
}

/* Squelette de chargement. */
.squelette__carte,
.squelette__ligne,
.squelette__barre {
  border-radius: 0.25rem;
  background: var(--background-contrast-grey);
  animation: squelette 1.4s ease-in-out infinite;
}
.squelette__carte {
  height: 7.5rem;
}
.squelette__barre {
  height: 1.5rem;
  margin-top: 1rem;
}
.squelette__ligne {
  height: 1rem;
  margin-top: 0.75rem;
  max-width: 40rem;
}
.squelette__ligne--titre {
  height: 1.5rem;
  max-width: 18rem;
}
@keyframes squelette {
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .squelette__carte,
  .squelette__ligne,
  .squelette__barre {
    animation: none;
  }
}
</style>
