<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/services/api'
import { duration, type Indicators } from '@/lib/indicators'
import CarbonFootprint from '@/components/CarbonFootprint.vue'
import type { AdaFootprint } from '@/lib/footprint'

const indicators = ref<Indicators | null>(null)
const footprint = ref<AdaFootprint | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  // The footprint is read on the device (ADA's log): fast, and independent of GitHub.
  api
    .read<AdaFootprint>('/indicators/footprint')
    .then((value) => (footprint.value = value))
    .catch(() => (footprint.value = null))
  try {
    indicators.value = await api.read<Indicators>('/indicators')
  } catch (e) {
    error.value = (e as Error).message
  }
})

/** The key figures, at the top of the page. */
const digits = computed(() =>
  indicators.value
    ? [
        { title: 'Projets passés par ADA', value: String(indicators.value.history.total) },
        { title: 'Projets actifs dans ADA', value: String(indicators.value.projects) },
        { title: 'Stories livrées', value: String(indicators.value.deliveredStories) },
        { title: 'Temps moyen du lancement à la livraison', value: duration(indicators.value.averageDurationMinutes) },
      ]
    : [],
)

/** What became of the projects: a (decorative) bar and its legend as text. */
const become = computed(() => {
  const summary = indicators.value?.history
  if (!summary) return []
  return [
    { key: 'active', label: 'Actifs dans ADA', count: summary.active },
    { key: 'archived', label: 'Archivés', count: summary.archives },
    { key: 'removed', label: 'Retirés d’ADA (reprise annulée, désynchronisés)', count: summary.removed },
    { key: 'deleted', label: 'Supprimés de GitHub', count: summary.deleted },
  ].map((state) => ({ ...state, part: summary.total ? (state.count / summary.total) * 100 : 0 }))
})

const headers = ['Projet', 'Stories livrées', 'Temps moyen de livraison']
const lines = computed(() =>
  (indicators.value?.byProject ?? []).map((project) => [project.name, String(project.deliveredStories), duration(project.averageDurationMinutes)]),
)
</script>

<template>
  <div class="fr-container fr-px-0">
    <h1>Indicateurs</h1>
    <p class="fr-text--lead">Ce qu’ADA a permis de livrer, calculé à partir de GitHub. Mis à jour toutes les 5 minutes au plus.</p>

    <DsfrAlert v-if="error" type="error" title="Indicateurs indisponibles" :description="error" />

    <!-- During the computation (several seconds): the shape of the page, without content. -->
    <div v-else-if="!indicators" class="skeleton" aria-busy="true">
      <p class="fr-sr-only" role="status">Calcul des indicateurs…</p>
      <div class="fr-grid-row fr-grid-row--gutters" aria-hidden="true">
        <div v-for="rank in 4" :key="rank" class="fr-col-12 fr-col-sm-6 fr-col-lg-3">
          <div class="skeleton__card" />
        </div>
      </div>
      <div class="skeleton__line skeleton__line--title fr-mt-5w" aria-hidden="true" />
      <div class="skeleton__bar" aria-hidden="true" />
      <div class="skeleton__line skeleton__line--title fr-mt-5w" aria-hidden="true" />
      <div v-for="rank in 3" :key="rank" class="skeleton__line" aria-hidden="true" />
    </div>

    <template v-else>
      <ul class="fr-grid-row fr-grid-row--gutters figures">
        <li v-for="chiffre in digits" :key="chiffre.title" class="fr-col-12 fr-col-sm-6 fr-col-lg-3">
          <div class="figures__card">
            <p class="figures__value">{{ chiffre.value }}</p>
            <p class="figures__title">{{ chiffre.title }}</p>
          </div>
        </li>
      </ul>
      <p class="fr-text--xs fr-mt-1w">Le temps de livraison ne compte que les stories lancées depuis ADA.</p>

      <h2 class="fr-h4 fr-mt-5w">Ce que sont devenus les projets</h2>
      <p class="fr-text--sm">
        {{ indicators.history.total }} projets passés par ADA :
        {{ indicators.history.created }} créés avec ADA, {{ indicators.history.adopted }} repris (créés ailleurs).
        ADA garde la trace de chaque projet, même archivé ou supprimé depuis.
      </p>
      <div v-if="indicators.history.total" class="outcome" aria-hidden="true">
        <span
          v-for="state in become.filter((element) => element.count)"
          :key="state.key"
          :class="['outcome__share', `outcome__share--${state.key}`]"
          :style="{ width: `${state.part}%` }"
        />
      </div>
      <ul class="legend fr-mt-2w">
        <li v-for="state in become" :key="state.key" class="legend__item">
          <span :class="['legend__dot', `outcome__share--${state.key}`]" aria-hidden="true" />
          <strong class="legend__count">{{ state.count }}</strong> {{ state.label }}
        </li>
      </ul>
      <p class="fr-text--xs">
        Les projets d’avant ce suivi sont repris d’après leur aperçu dans ADA ; leur origine est alors
        comptée comme « créé avec ADA ».
      </p>

      <h2 class="fr-h4 fr-mt-5w">Par projet actif</h2>
      <DsfrTable v-if="lines.length" class="full-width-table" title="Indicateurs par projet" no-caption :headers="headers" :rows="lines" />
      <p v-else>Aucun projet actif pour l’instant.</p>
    </template>

    <CarbonFootprint v-if="footprint" :footprint="footprint" />
  </div>
</template>

<style scoped>
.figures {
  list-style: none;
  padding: 0;
  margin: 0;
}
.figures__card {
  height: 100%;
  padding: 1.5rem;
  background: var(--background-alt-blue-france);
  border-bottom: 4px solid var(--border-plain-blue-france);
}
.figures__value {
  margin: 0 0 0.25rem;
  font-size: 2.5rem;
  line-height: 1.1;
  font-weight: 700;
  color: var(--text-title-blue-france);
}
.figures__title {
  margin: 0;
  font-size: 0.875rem;
}

/* Bar of what became of the projects: decorative, the legend gives the same information as text. */
.outcome {
  display: flex;
  height: 1.5rem;
  border-radius: 0.25rem;
  overflow: hidden;
  background: var(--background-contrast-grey);
}
.outcome__share {
  display: block;
  min-width: 0.5rem;
}
.outcome__share--active {
  background: var(--background-flat-success);
}
.outcome__share--archived {
  background: var(--background-flat-grey);
}
.outcome__share--removed {
  background: var(--background-flat-warning);
}
.outcome__share--deleted {
  background: var(--background-flat-error);
}
.legend {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2rem;
}
.legend__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.legend__dot {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border-radius: 0.2rem;
}
.legend__count {
  font-size: 1.25rem;
}

/* The DSFR wraps the table in several boxes as wide as the content: all at full width. */
.full-width-table,
.full-width-table :deep(.fr-table__wrapper),
.full-width-table :deep(.fr-table__container),
.full-width-table :deep(.fr-table__content),
.full-width-table :deep(table) {
  width: 100%;
}
/* The DSFR displays the table as a block (to make it scroll): its rows do not stretch. */
.full-width-table :deep(table) {
  display: table;
}

/* Loading skeleton. */
.skeleton__card,
.skeleton__line,
.skeleton__bar {
  border-radius: 0.25rem;
  background: var(--background-contrast-grey);
  animation: skeleton 1.4s ease-in-out infinite;
}
.skeleton__card {
  height: 7.5rem;
}
.skeleton__bar {
  height: 1.5rem;
  margin-top: 1rem;
}
.skeleton__line {
  height: 1rem;
  margin-top: 0.75rem;
  max-width: 40rem;
}
.skeleton__line--title {
  height: 1.5rem;
  max-width: 18rem;
}
@keyframes skeleton {
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton__card,
  .skeleton__line,
  .skeleton__bar {
    animation: none;
  }
}
</style>
