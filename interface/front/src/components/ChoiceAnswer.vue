<script setup lang="ts">
import { reactive, ref } from 'vue'
import { composeAnswer, type ChoiceQuestion } from '@/lib/story'

/** Answer to the assistant's choice questions: checkboxes (or radio buttons) and free clarification. */
const props = defineProps<{ questions: ChoiceQuestion[]; actionInProgress?: boolean; sendDescription?: string }>()

/** ADA numbers the questions: the number already written by the assistant (“1.”) is not repeated. */
const withoutNumber = (question: string) => question.replace(/^\d+\s*[.)]\s*/, '')
const emit = defineEmits<{ reply: [text: string] }>()

const answers = reactive(props.questions.map(() => ({ ticked: [] as string[], unique: undefined as string | undefined, precision: '' })))
const errors = ref<string[]>([])

const options = (rank: number, question: ChoiceQuestion) =>
  question.choice.map((option, position) => ({
    id: `choice-${rank}-${position}`,
    name: `question-${rank}`,
    label: option,
    value: option,
  }))

function send(): void {
  const chosen = answers.map((response, rank) => ({
    ticked: props.questions[rank]!.several ? response.ticked : response.unique ? [response.unique] : [],
    precision: response.precision,
  }))
  errors.value = chosen.map((response) =>
    response.ticked.length || response.precision.trim() ? '' : 'Cochez une réponse, ou écrivez une précision',
  )
  if (errors.value.some(Boolean)) return
  emit('reply', composeAnswer(props.questions, chosen))
}
</script>

<template>
  <form novalidate class="fr-mt-2w" @submit.prevent="send">
    <DsfrAlert type="info" small class="fr-mb-2w" description="ADA attend vos réponses pour continuer. Cochez, et précisez si besoin." />
    <div v-for="(question, rank) in questions" :key="question.question" class="fr-mb-3w">
      <DsfrCheckboxSet
        v-if="question.several"
        v-model="answers[rank]!.ticked"
        :legend="`${rank + 1}. ${withoutNumber(question.question)} (plusieurs réponses possibles)`"
        :options="options(rank, question)"
        :error-message="errors[rank]"
      />
      <DsfrRadioButtonSet
        v-else
        v-model="answers[rank]!.unique"
        :name="`question-${rank}`"
        :legend="`${rank + 1}. ${withoutNumber(question.question)}`"
        :options="options(rank, question)"
        :error-message="errors[rank]"
      />
      <DsfrInputGroup
        v-model="answers[rank]!.precision"
        :label="`Autre / précision pour la question ${rank + 1} (facultatif)`"
        label-visible
      />
    </div>
    <slot name="before-send" />
    <DsfrButton type="submit" label="Envoyer mes réponses" :aria-describedby="sendDescription" :disabled="actionInProgress" />
  </form>
</template>
