<script setup lang="ts">
import { computed } from 'vue'
import type { Question, Valeur } from '@/services/formulaire'

/** Une question du formulaire, rendue avec le composant DSFR adapté à son type. */
const props = defineProps<{ question: Question; erreur?: string }>()
const valeur = defineModel<Valeur | undefined>()

const identifiant = computed(() => `question-${props.question.id}`)
const libelle = computed(() => props.question.libelle + (props.question.obligatoire ? ' (obligatoire)' : ''))
const options = computed(() =>
  (props.question.choix ?? []).map((choix, rang) => ({
    id: `${identifiant.value}-${rang}`,
    name: identifiant.value,
    label: choix,
    value: choix,
  })),
)
const typeChamp = computed(
  () => ({ courriel: 'email', telephone: 'tel', nombre: 'number', date: 'date' })[props.question.type as string] ?? 'text',
)
const autocompletion = computed(
  () => ({ courriel: 'email', telephone: 'tel' })[props.question.type as string] ?? (props.question.id === 'nom' ? 'name' : undefined),
)
const texte = computed({
  get: () => (typeof valeur.value === 'string' || typeof valeur.value === 'number' ? valeur.value : ''),
  set: (nouvelle: string | number) => (valeur.value = nouvelle),
})
const choixMultiples = computed({
  get: () => (Array.isArray(valeur.value) ? valeur.value : []),
  set: (nouveaux: unknown[]) => (valeur.value = nouveaux.map(String)),
})
const choixUnique = computed({
  get: () => (typeof valeur.value === 'string' ? valeur.value : undefined),
  set: (nouveau: string | number | boolean | undefined) => (valeur.value = nouveau === undefined ? undefined : String(nouveau)),
})
</script>

<template>
  <DsfrRadioButtonSet
    v-if="question.type === 'choix-unique'"
    v-model="choixUnique"
    :title-id="identifiant"
    :name="identifiant"
    :legend="libelle"
    :hint="question.aide"
    :options="options"
    :required="question.obligatoire"
    :error-message="erreur"
  />
  <DsfrCheckboxSet
    v-else-if="question.type === 'choix-multiple'"
    v-model="choixMultiples"
    :title-id="identifiant"
    :legend="libelle"
    :options="options"
    :error-message="erreur"
  />
  <DsfrInputGroup
    v-else
    :id="identifiant"
    v-model="texte"
    :label="libelle"
    label-visible
    :hint="question.aide"
    :type="typeChamp"
    :autocomplete="autocompletion"
    :required="question.obligatoire"
    :is-textarea="question.type === 'texte-long'"
    :error-message="erreur"
  />
</template>
