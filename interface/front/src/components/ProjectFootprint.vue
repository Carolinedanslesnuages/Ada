<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/services/api'
import { asStreaming, formatCo2, type Footprint } from '@/lib/footprint'

/**
 * Estimated carbon footprint of the project, all requests combined: read again at each return to
 * the project home. Nothing is displayed until ADA has worked on it.
 */
const props = defineProps<{ project: string }>()

const total = ref<{ footprint: Footprint; workRequests: number; equivalents: { streamingHourGrams: number } } | null>(null)

async function read(): Promise<void> {
  try {
    total.value = await api.read(`/projects/${encodeURIComponent(props.project)}/footprint`)
  } catch {
    total.value = null
  }
}
watch(() => props.project, () => void read(), { immediate: true })
</script>

<template>
  <p v-if="total" class="fr-text--xs project-footprint" data-testid="project-footprint">
    <span class="fr-icon-leaf-line fr-icon--sm" aria-hidden="true" />
    Empreinte estimée de ce projet : {{ formatCo2(total.footprint.co2Grams) }}, soit
    {{ asStreaming(total.footprint.co2Grams, total.equivalents.streamingHourGrams) }}, pour
    {{ total.workRequests }} {{ total.workRequests > 1 ? 'demandes' : 'demande' }}.
    <RouterLink to="/indicators">Comment c’est calculé</RouterLink>
  </p>
</template>

<style scoped>
.project-footprint {
  text-align: center;
  color: var(--text-mention-grey);
  margin: 0;
}
</style>
