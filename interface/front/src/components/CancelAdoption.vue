<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import type { Project } from '@/stores/projects'

/**
 * Cancel a pending adoption, or remove a project from ADA (created by it or adopted). Nothing is
 * deleted on GitHub:
 * a confirmation says exactly what will happen before acting.
 */
const props = defineProps<{ project: Project }>()
const emit = defineEmits<{ done: [state: 'cancelled' | 'unlinked'] }>()

const confirmation = ref(false)
const inProgress = ref(false)
const error = ref<string | null>(null)
const pending = computed(() => props.project.adoption !== null)
const label = computed(() => (pending.value ? 'Annuler la reprise' : 'Retirer d’ADA'))

async function confirm(): Promise<void> {
  inProgress.value = true
  error.value = null
  try {
    const { state } = await api.send<{ state: 'cancelled' | 'unlinked' }>(
      `/projects/${encodeURIComponent(props.project.id)}/adoption/cancel`,
      {},
    )
    confirmation.value = false
    emit('done', state)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    inProgress.value = false
  }
}
</script>

<template>
  <DsfrButton
    v-if="!confirmation"
    size="sm"
    tertiary
    icon="fr-icon-close-circle-line"
    :label="label"
    @click="confirmation = true"
  />
  <div v-else class="fr-callout fr-mt-2w fr-mb-2w" role="group" aria-labelledby="cancel-adoption-title">
    <h2 id="cancel-adoption-title" class="fr-callout__title fr-h6">{{ label }} « {{ project.name }} » ?</h2>
    <p v-if="pending" class="fr-callout__text fr-text--sm">
      La reprise n’est pas encore validée : ADA ferme sa pull request et sa branche, et clôt la
      demande d’analyse. Le projet n’a jamais été modifié et disparaît d’ADA. Vous pourrez le
      reprendre plus tard.
    </p>
    <p v-else class="fr-callout__text fr-text--sm">
      Le projet disparaît d’ADA, mais rien n’est supprimé sur GitHub : le dépôt, ses stories, ses
      versions et les fichiers ajoutés par ADA restent. Vous pourrez le faire revenir avec
      « Reprendre un projet ».
    </p>
    <DsfrAlert v-if="error" type="error" small :description="error" class="fr-mb-2w" />
    <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--sm">
      <li><DsfrButton :label="inProgress ? 'En cours…' : pending ? 'Confirmer l’annulation' : 'Confirmer le retrait'" :disabled="inProgress" @click="confirm" /></li>
      <li><DsfrButton secondary label="Garder le projet dans ADA" :disabled="inProgress" @click="confirmation = false" /></li>
    </ul>
  </div>
</template>
