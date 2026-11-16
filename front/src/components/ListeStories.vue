<script setup lang="ts">
import { LIBELLES_STATUT, type ResumeStory } from '@/lib/story'

defineProps<{ stories: ResumeStory[]; numeroCourant?: number | null }>()
const emit = defineEmits<{ ouvrir: [numero: number] }>()
</script>

<template>
  <ul class="liste-stories" aria-label="Stories du projet">
    <li v-for="story in stories" :key="story.numero">
      <button
        type="button"
        :aria-current="story.numero === numeroCourant ? 'true' : undefined"
        @click="emit('ouvrir', story.numero)"
      >
        <span>
          <span class="fr-text--xs fr-mb-0">#{{ story.numero }}</span>
          <span v-if="story.type === 'bug'" class="fr-text--xs fr-mb-0"> Problème :</span>
          {{ story.titre }}
        </span>
        <DsfrBadge
          :label="LIBELLES_STATUT[story.statut].libelle"
          :type="LIBELLES_STATUT[story.statut].type"
          small
          no-icon
        />
      </button>
    </li>
  </ul>
</template>
