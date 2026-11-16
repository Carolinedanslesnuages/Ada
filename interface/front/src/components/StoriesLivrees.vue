<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ResumeStory } from '@/lib/story'

/** Stories livrées, repliées par défaut : les 10 dernières, et le lien vers tout l'historique. */
const props = defineProps<{ stories: ResumeStory[]; urlDepot: string; numeroCourant?: number | null }>()
const emit = defineEmits<{ ouvrir: [numero: number] }>()

const NOMBRE_LIVREES_AFFICHEES = 10

const accordeonOuvert = ref(-1)
const dernieres = computed(() => props.stories.slice(0, NOMBRE_LIVREES_AFFICHEES))
const lienHistorique = computed(() => `${props.urlDepot}/issues?q=${encodeURIComponent('is:issue is:closed')}`)
const titre = computed(() => `Déjà livrées (${props.stories.length})`)
</script>

<template>
  <DsfrAccordionsGroup v-model="accordeonOuvert" class="fr-mt-3w">
    <DsfrAccordion id="stories-livrees" :title="titre">
      <p v-if="stories.length > NOMBRE_LIVREES_AFFICHEES" class="fr-text--sm">
        Les {{ NOMBRE_LIVREES_AFFICHEES }} dernières livrées.
      </p>
      <ul class="liste-stories" aria-label="Stories déjà livrées">
        <li v-for="story in dernieres" :key="story.numero">
          <button
            type="button"
            :aria-current="story.numero === numeroCourant ? 'true' : undefined"
            @click="emit('ouvrir', story.numero)"
          >
            <span>
              <span class="fr-text--xs fr-mb-0">#{{ story.numero }}</span>
              <span v-if="story.type === 'bug'" class="fr-text--xs fr-mb-0"> Problème :</span>
              <span v-else-if="story.type === 'libre'" class="fr-text--xs fr-mb-0"> Mode libre :</span>
              {{ story.titre }}
            </span>
          </button>
        </li>
      </ul>
      <a class="fr-link fr-link--sm fr-icon-external-link-line fr-link--icon-right" :href="lienHistorique" target="_blank" rel="noopener">
        Voir tout sur GitHub<span class="fr-sr-only"> (nouvelle fenêtre)</span>
      </a>
    </DsfrAccordion>
  </DsfrAccordionsGroup>
</template>
