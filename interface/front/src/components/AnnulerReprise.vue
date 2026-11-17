<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import type { Projet } from '@/stores/projets'

/**
 * Annuler une reprise en attente, ou désynchroniser un projet repris. Rien n'est supprimé :
 * une confirmation dit exactement ce qui va se passer avant d'agir.
 */
const props = defineProps<{ projet: Projet }>()
const emit = defineEmits<{ fait: [etat: 'annulee' | 'desynchronisee'] }>()

const confirmation = ref(false)
const enCours = ref(false)
const erreur = ref<string | null>(null)
const enAttente = computed(() => props.projet.reprise !== null)
const libelle = computed(() => (enAttente.value ? 'Annuler la reprise' : 'Désynchroniser d’ADA'))

async function confirmer(): Promise<void> {
  enCours.value = true
  erreur.value = null
  try {
    const { etat } = await api.envoyer<{ etat: 'annulee' | 'desynchronisee' }>(
      `/projets/${encodeURIComponent(props.projet.id)}/reprise/annuler`,
      {},
    )
    confirmation.value = false
    emit('fait', etat)
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    enCours.value = false
  }
}
</script>

<template>
  <DsfrButton
    v-if="!confirmation"
    size="sm"
    tertiary
    icon="fr-icon-close-circle-line"
    :label="libelle"
    @click="confirmation = true"
  />
  <div v-else class="fr-callout fr-mt-2w fr-mb-2w" role="group" aria-labelledby="titre-annuler-reprise">
    <h2 id="titre-annuler-reprise" class="fr-callout__title fr-h6">{{ libelle }} « {{ projet.nom }} » ?</h2>
    <p v-if="enAttente" class="fr-callout__text fr-text--sm">
      La reprise n’est pas encore validée : ADA ferme sa pull request et sa branche, et clôt la
      demande d’analyse. Le projet n’a jamais été modifié et disparaît d’ADA. Vous pourrez le
      reprendre plus tard.
    </p>
    <p v-else class="fr-callout__text fr-text--sm">
      Le projet disparaît d’ADA, mais rien n’est supprimé : les fichiers, les stories et les versions
      ajoutés par ADA restent dans le projet. Vous pourrez le reprendre plus tard.
    </p>
    <DsfrAlert v-if="erreur" type="error" small :description="erreur" class="fr-mb-2w" />
    <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--sm">
      <li><DsfrButton :label="enCours ? 'En cours…' : enAttente ? 'Confirmer l’annulation' : 'Confirmer la désynchronisation'" :disabled="enCours" @click="confirmer" /></li>
      <li><DsfrButton secondary label="Garder le projet dans ADA" :disabled="enCours" @click="confirmation = false" /></li>
    </ul>
  </div>
</template>
