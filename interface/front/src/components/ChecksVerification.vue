<script setup lang="ts">
/** Review of an implemented request: checks of the PR, then “Valider et fusionner”. */
import { CHECK_LABELS, type Verification } from '@/lib/story'

defineProps<{ verification: Verification | null | undefined; actionInProgress?: boolean }>()
const emit = defineEmits<{ merge: []; rerunChecks: [] }>()
</script>

<template>
  <p class="fr-text--sm">
    Regardez le résultat dans l’aperçu. Quand tous les contrôles sont réussis, validez :
    la demande sera ajoutée au projet et la suivante pourra être lancée.
  </p>
  <p v-if="!verification" class="fr-text--sm">Lecture des contrôles…</p>
  <template v-else>
    <ul class="fr-text--sm checks">
      <li v-for="check in verification.checks" :key="check.name">
        <span
          :class="{
            'fr-icon-checkbox-circle-fill check--passed': check.state === 'succeeded',
            'fr-icon-close-circle-fill check--failed': check.state === 'failed',
            'fr-icon-time-line': check.state === 'in-progress' || check.state === 'pending',
            'fr-icon-warning-line': check.state === 'not-launched',
          }"
          class="fr-icon--sm"
          aria-hidden="true"
        />
        {{ check.name }} : {{ CHECK_LABELS[check.state] }}
      </li>
    </ul>
    <p v-if="verification.reason" class="fr-text--sm fr-mb-2w">{{ verification.reason }}</p>
    <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
      <li>
        <DsfrButton
          icon="fr-icon-check-line"
          label="Valider et fusionner"
          :disabled="!verification.mergeable || actionInProgress"
          @click="emit('merge')"
        />
      </li>
      <li v-if="verification.checks.some((check) => check.state === 'not-launched')">
        <DsfrButton secondary icon="fr-icon-refresh-line" label="Relancer les contrôles" :disabled="actionInProgress" @click="emit('rerunChecks')" />
      </li>
    </ul>
  </template>
</template>
