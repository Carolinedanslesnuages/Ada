<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { MAX_CRITERIA, type ProposedStory } from '@/lib/story'

/**
 * Breakdown proposed by the assistant (#36): each story is prefilled and collapsed (only its title
 * is read at a glance). The PO ticks the ones to publish, corrects if they wish, then approves:
 * ADA publishes them on GitHub under their name. A story that overlaps an already written story arrives unticked,
 * with a warning: a PO in a hurry does not publish a duplicate without seeing it.
 */
const props = withDefaults(
  defineProps<{
    stories: ProposedStory[]
    designation: string
    actionInProgress?: boolean
    /** False in conversation: for other stories, the PO simply answers ADA. */
    otherBreakdown?: boolean
  }>(),
  { otherBreakdown: true },
)
const emit = defineEmits<{ create: [stories: ProposedStory[]]; otherBreakdown: [] }>()

/** Editable fields, prefilled; the criteria are written one per line. */
const drafts = reactive(
  props.stories.map((story) => ({
    publish: !story.duplicateOf,
    duplicateOf: story.duplicateOf ?? null,
    title: story.title,
    role: story.role,
    need: story.need,
    benefit: story.benefit,
    criteria: story.criteria.join('\n'),
  })),
)
const open = ref(-1)
const duplicates = drafts.filter((draft) => draft.duplicateOf).length
const errors = ref<string[]>([])
const count = computed(() => drafts.filter((draft) => draft.publish).length)
const buttonLabel = computed(() => (count.value > 1 ? `Publier les ${count.value} stories sur GitHub` : 'Publier la story sur GitHub'))
const generalError = ref('')

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)

function verify(draft: (typeof drafts)[number]): string {
  if (!draft.publish) return ''
  const missing = [
    !draft.title.trim() && 'le titre',
    !draft.role.trim() && '« en tant que »',
    !draft.need.trim() && '« je veux »',
    !draft.benefit.trim() && '« afin de »',
  ].filter(Boolean)
  if (missing.length) return `Complétez ${missing.join(', ')}`
  const criteriaCount = lines(draft.criteria).length
  if (criteriaCount < 1 || criteriaCount > MAX_CRITERIA) return `De 1 à ${MAX_CRITERIA} critères d’acceptation, un par ligne`
  return ''
}

function publish(): void {
  errors.value = drafts.map(verify)
  generalError.value = count.value ? '' : 'Cochez au moins une story'
  const firstError = errors.value.findIndex(Boolean)
  if (firstError >= 0) open.value = firstError
  if (generalError.value || firstError >= 0) return
  emit(
    'create',
    drafts
      .filter((draft) => draft.publish)
      .map((draft) => ({
        title: draft.title.trim(),
        role: draft.role.trim(),
        need: draft.need.trim(),
        benefit: draft.benefit.trim(),
        criteria: lines(draft.criteria),
      })),
  )
}
</script>

<template>
  <form novalidate class="fr-mt-2w" aria-labelledby="breakdown-title" @submit.prevent="publish">
    <h4 id="breakdown-title" class="fr-h6 fr-mb-1w">Stories proposées</h4>
    <p class="fr-text--sm">Cochez celles à publier. Ouvrez une story pour la relire ou la corriger.</p>
    <DsfrAlert
      v-if="duplicates"
      type="warning"
      small
      class="fr-mb-2w"
      :description="duplicates > 1 ? `${duplicates} stories ressemblent à des stories déjà écrites : je ne les ai pas cochées.` : 'Une story ressemble à une story déjà écrite : je ne l’ai pas cochée.'"
    />

    <ul class="fr-p-0 breakdown">
      <li v-for="(draft, rank) in drafts" :key="rank" class="fr-mb-2w">
        <div class="fr-checkbox-group">
          <input
            :id="`proposed-story-${rank}`"
            v-model="draft.publish"
            type="checkbox"
            :aria-describedby="draft.duplicateOf ? `proposed-story-${rank}-duplicate` : undefined"
          />
          <label class="fr-label" :for="`proposed-story-${rank}`">Publier « {{ draft.title || 'sans titre' }} »</label>
        </div>
        <p v-if="draft.duplicateOf" :id="`proposed-story-${rank}-duplicate`" class="fr-message fr-message--warning fr-mt-1v">
          Ressemble à la story n° {{ draft.duplicateOf }}, déjà dans le projet. Cochez-la seulement si ce n’est pas la même chose.
        </p>
        <p v-if="errors[rank]" class="fr-error-text fr-mt-1v" role="alert">Story {{ rank + 1 }} : {{ errors[rank] }}</p>
        <DsfrAccordionsGroup v-model="open">
          <DsfrAccordion :id="`proposed-story-${rank}-detail`" :title="`Relire ou modifier la story ${rank + 1}`">
            <DsfrInputGroup v-model="draft.title" :label="`Titre (story ${rank + 1})`" label-visible />
            <DsfrInputGroup v-model="draft.role" :label="`En tant que (story ${rank + 1})`" label-visible />
            <DsfrInputGroup v-model="draft.need" :label="`Je veux (story ${rank + 1})`" label-visible is-textarea />
            <DsfrInputGroup v-model="draft.benefit" :label="`Afin de (story ${rank + 1})`" label-visible is-textarea />
            <DsfrInputGroup
              v-model="draft.criteria"
              :label="`Critères d’acceptation (story ${rank + 1})`"
              :hint="`Un par ligne, ${MAX_CRITERIA} au maximum`"
              label-visible
              is-textarea
            />
          </DsfrAccordion>
        </DsfrAccordionsGroup>
      </li>
    </ul>

    <p v-if="generalError" class="fr-error-text" role="alert">{{ generalError }}</p>
    <p id="breakdown-saving" class="fr-text--sm fr-mb-2w">
      <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
      <strong>ADA publiera ces stories sur GitHub, à votre nom</strong>, reliées à {{ designation }}.
    </p>
    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li><DsfrButton type="submit" :label="buttonLabel" aria-describedby="breakdown-saving" :disabled="actionInProgress" /></li>
      <li v-if="otherBreakdown">
        <DsfrButton type="button" secondary label="Demander un autre découpage" :disabled="actionInProgress" @click="emit('otherBreakdown')" />
      </li>
    </ul>
  </form>
</template>

<style scoped>
.breakdown {
  list-style: none;
}
</style>
