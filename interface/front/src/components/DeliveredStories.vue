<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StorySummary } from '@/lib/story'

/** Delivered stories, collapsed by default: the last 10, and the link to the whole history. */
const props = defineProps<{ stories: StorySummary[]; repositoryUrl: string; currentNumber?: number | null }>()
const emit = defineEmits<{ open: [number: number] }>()

const DISPLAYED_DELIVERED_COUNT = 10

const openAccordion = ref(-1)
const last = computed(() => props.stories.slice(0, DISPLAYED_DELIVERED_COUNT))
const historyLink = computed(() => `${props.repositoryUrl}/issues?q=${encodeURIComponent('is:issue is:closed')}`)
const title = computed(() => `Déjà livrées (${props.stories.length})`)
</script>

<template>
  <DsfrAccordionsGroup v-model="openAccordion" class="fr-mt-3w">
    <DsfrAccordion id="delivered-stories" :title="title">
      <p v-if="stories.length > DISPLAYED_DELIVERED_COUNT" class="fr-text--sm">
        Les {{ DISPLAYED_DELIVERED_COUNT }} dernières livrées.
      </p>
      <ul class="story-list" aria-label="Stories déjà livrées">
        <li v-for="story in last" :key="story.number">
          <button
            type="button"
            :aria-current="story.number === currentNumber ? 'true' : undefined"
            @click="emit('open', story.number)"
          >
            <span>
              <span class="fr-text--xs fr-mb-0">#{{ story.number }}</span>
              <span v-if="story.type === 'bug'" class="fr-text--xs fr-mb-0"> Problème :</span>
              <span v-else-if="story.type === 'free'" class="fr-text--xs fr-mb-0"> Mode libre :</span>
              {{ story.title }}
            </span>
          </button>
        </li>
      </ul>
      <a class="fr-link fr-link--sm fr-icon-external-link-line fr-link--icon-right" :href="historyLink" target="_blank" rel="noopener">
        Voir tout sur GitHub<span class="fr-sr-only"> (nouvelle fenêtre)</span>
      </a>
    </DsfrAccordion>
  </DsfrAccordionsGroup>
</template>
