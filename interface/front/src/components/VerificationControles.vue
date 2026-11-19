<script setup lang="ts">
/** Vérification d'une demande réalisée : contrôles de la PR, puis « Valider et fusionner ». */
import { LIBELLES_CONTROLE, type Verification } from '@/lib/story'

defineProps<{ verification: Verification | null | undefined; actionEnCours?: boolean }>()
const emit = defineEmits<{ fusionner: []; relancerControles: [] }>()
</script>

<template>
  <p class="fr-text--sm">
    Regardez le résultat dans l’aperçu. Quand tous les contrôles sont réussis, validez :
    la demande sera ajoutée au projet et la suivante pourra être lancée.
  </p>
  <p v-if="!verification" class="fr-text--sm">Lecture des contrôles…</p>
  <template v-else>
    <ul class="fr-text--sm controles">
      <li v-for="controle in verification.controles" :key="controle.nom">
        <span
          :class="{
            'fr-icon-checkbox-circle-fill controle--ok': controle.etat === 'reussi',
            'fr-icon-close-circle-fill controle--ko': controle.etat === 'echec',
            'fr-icon-time-line': controle.etat === 'en-cours' || controle.etat === 'en-attente',
            'fr-icon-warning-line': controle.etat === 'non-lance',
          }"
          class="fr-icon--sm"
          aria-hidden="true"
        />
        {{ controle.nom }} : {{ LIBELLES_CONTROLE[controle.etat] }}
      </li>
    </ul>
    <p v-if="verification.raison" class="fr-text--sm fr-mb-2w">{{ verification.raison }}</p>
    <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
      <li>
        <DsfrButton
          icon="fr-icon-check-line"
          label="Valider et fusionner"
          :disabled="!verification.fusionnable || actionEnCours"
          @click="emit('fusionner')"
        />
      </li>
      <li v-if="verification.controles.some((controle) => controle.etat === 'non-lance')">
        <DsfrButton secondary icon="fr-icon-refresh-line" label="Relancer les contrôles" :disabled="actionEnCours" @click="emit('relancerControles')" />
      </li>
    </ul>
  </template>
</template>
