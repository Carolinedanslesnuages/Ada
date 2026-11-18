<script setup lang="ts">
import { computed, ref } from 'vue'
import { MESSAGE_MAX } from '@/lib/story'

/**
 * Premier message d'une conversation (« vrai prompt ») : le PO parle librement à ADA, qui agit
 * tout de suite sur une branche à part. Rien n'arrive sur le projet avant qu'il dise « c'est bon ».
 */
const props = defineProps<{ envoiEnCours?: boolean; erreurServeur?: string | null }>()
const emit = defineEmits<{ soumettre: [texte: string]; annuler: [] }>()

const texte = ref('')
const erreurLocale = ref('')
const erreur = computed(() => erreurLocale.value || props.erreurServeur || '')

function envoyer(): void {
  const propre = texte.value.trim()
  if (propre.length < 10) {
    erreurLocale.value = 'Dites à ADA ce que vous voulez faire, en une phrase au moins'
    return
  }
  if (propre.length > MESSAGE_MAX) {
    erreurLocale.value = `${MESSAGE_MAX} caractères au maximum par message : envoyez la suite dans un autre message`
    return
  }
  erreurLocale.value = ''
  emit('soumettre', propre)
}
</script>

<template>
  <form novalidate @submit.prevent="envoyer">
    <h2 class="fr-h4">Discuter avec ADA</h2>
    <div class="fr-callout fr-mb-3w">
      <p class="fr-callout__text fr-text--sm">
        Parlez à ADA librement, <strong>comme à une développeuse à côté de vous</strong> : demandez
        un changement, posez une question, corrigez le tir au fil de l’eau.
      </p>
      <ul class="fr-text--sm fr-mt-1w fr-mb-0">
        <li>ADA agit <strong>tout de suite</strong>, sur une copie à part : l’aperçu montre le résultat.</li>
        <li>
          <strong>Rien n’arrive sur le projet</strong> avant que vous disiez « c’est bon » : ADA
          propose alors ses changements, qui passent les contrôles avant que vous les ajoutiez.
        </li>
      </ul>
    </div>
    <DsfrInputGroup
      v-model="texte"
      label="Votre message à ADA"
      hint="Aussi long ou aussi court que vous voulez"
      label-visible
      is-textarea
      :error-message="erreur"
    />
    <p id="conversation-enregistrement" class="fr-text--sm fr-mb-2w">
      <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
      <strong>La conversation est enregistrée sur GitHub</strong>, comme une demande du projet
      (une issue, visible par l’équipe), à votre nom. Elle garde la trace de tous les échanges.
    </p>
    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li>
        <DsfrButton
          type="submit"
          aria-describedby="conversation-enregistrement"
          :label="envoiEnCours ? 'Envoi…' : 'Envoyer à ADA'"
          :disabled="envoiEnCours"
        />
      </li>
      <li><DsfrButton type="button" secondary label="Annuler" @click="emit('annuler')" /></li>
    </ul>
  </form>
</template>
