<script setup lang="ts">
import { computed, ref } from 'vue'
import DictateButton from '@/components/DictateButton.vue'
import { MAX_PROMPT_LENGTH, MIN_PROMPT_LENGTH } from '@/lib/story'

const props = defineProps<{ sendInProgress?: boolean; serverError?: string | null }>()
const emit = defineEmits<{ submit: [text: string]; cancel: [] }>()

const text = ref('')
const localError = ref('')
const error = computed(() => localError.value || props.serverError || '')

/** Dictation: each recognized sentence is appended to the text. */
function addDictation(phrase: string): void {
  text.value = text.value.trim() ? `${text.value.trimEnd()} ${phrase}` : phrase
}

function send(): void {
  const clean = text.value.trim()
  if (clean.length < MIN_PROMPT_LENGTH) {
    localError.value = 'Décrivez votre demande en une phrase au moins'
    return
  }
  if (clean.length > MAX_PROMPT_LENGTH) {
    localError.value = `${MAX_PROMPT_LENGTH} caractères au maximum : pour une demande plus importante, écrivez des stories`
    return
  }
  localError.value = ''
  emit('submit', clean)
}
</script>

<template>
  <form novalidate @submit.prevent="send">
    <h2 class="fr-h4">Prompter (mode libre)</h2>
    <div class="fr-callout fr-mb-3w">
      <p class="fr-callout__text fr-text--sm">
        Pour un <strong>petit changement</strong> qui ne mérite pas une story : « mets le titre
        en bleu », « ajoute un lien vers le guide dans le pied de page »…
        <strong>Pas une application entière</strong> : pour une nouvelle fonctionnalité, écrivez
        une story. Si la demande est trop grosse, ADA vous proposera de la découper.
      </p>
      <p class="fr-callout__text fr-text--sm fr-mt-1w">
        ADA vous propose ensuite un plan à valider avant de modifier quoi que ce soit.
      </p>
    </div>
    <DsfrInputGroup
      id="prompt-text"
      v-model="text"
      label="Votre demande"
      :hint="`Une ou quelques phrases (${MAX_PROMPT_LENGTH} caractères au maximum)`"
      label-visible
      is-textarea
      :error-message="error"
    />
    <DictateButton field="prompt-text" class="fr-mb-2w" @text="addDictation" />
    <p class="fr-text--sm fr-mb-2w" id="prompt-saving">
      <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
      <strong>En envoyant, votre texte est enregistré tel quel sur GitHub, comme une demande
      « mode libre » du projet</strong> (une issue, visible par l’équipe). Elle apparaît dans la
      liste des demandes et garde la trace de tous les échanges.
    </p>
    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li>
        <DsfrButton
          aria-describedby="prompt-saving"
          type="submit" :label="sendInProgress ? 'Envoi…' : 'Envoyer à ADA'" :disabled="sendInProgress" />
      </li>
      <li><DsfrButton type="button" secondary label="Annuler" @click="emit('cancel')" /></li>
    </ul>
  </form>
</template>
