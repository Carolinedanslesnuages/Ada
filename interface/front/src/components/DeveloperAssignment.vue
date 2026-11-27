<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StoryDetail } from '@/lib/story'
import { useStoriesStore } from '@/stores/stories'

/**
 * Blocked request (“Needs a developer”): the PO chooses a developer and assigns it to them
 * on GitHub. ADA does not notify them: they were told some other way.
 */
const props = defineProps<{ project: string; story: StoryDetail }>()
const stories = useStoriesStore()

const choice = ref('')
const choiceInProgress = ref(false)
const action = ref(false)
const assignee = computed(() => props.story.assignees[0] ?? null)
const blocked = computed(() => props.story.status === 'needs-developer')
const options = computed(() => (stories.developers ?? []).map((person) => ({ value: person.login, text: person.login })))

async function openChoice(): Promise<void> {
  choiceInProgress.value = true
  choice.value = assignee.value?.login ?? ''
  if (stories.developers === null) await stories.loadDevelopers(props.project)
}

async function act(login: string | null): Promise<void> {
  action.value = true
  await stories.assign(props.project, props.story.number, login)
  action.value = false
  if (!stories.actionError) choiceInProgress.value = false
}
</script>

<template>
  <section v-if="blocked || assignee" class="fr-mb-3w" aria-labelledby="assignment-title">
    <h3 id="assignment-title" class="fr-h6 fr-mb-1w">Développeur</h3>
    <p v-if="assignee" class="fr-mb-1w" role="status">
      Assignée à <strong>{{ assignee.login }}</strong> sur GitHub.
    </p>
    <p v-else class="fr-text--sm fr-mb-1w">
      Prévenez un développeur, puis assignez-lui cette demande : elle apparaîtra dans son GitHub.
    </p>

    <form v-if="choiceInProgress" novalidate @submit.prevent="choice && act(choice)">
      <DsfrSelect
        v-model="choice"
        label="Développeur à assigner"
        default-unselected-text="Choisir un développeur"
        :options="options"
        hint="Seules les personnes qui ont accès au projet sur GitHub sont proposées."
      />
      <p v-if="stories.developers?.length === 0" class="fr-text--sm">
        Personne d’autre n’a accès au projet : demandez à l’administrateur d’ajouter les développeurs.
      </p>
      <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--sm">
        <li><DsfrButton type="submit" size="sm" label="Assigner" :disabled="!choice || action" /></li>
        <li><DsfrButton type="button" size="sm" tertiary label="Annuler" @click="choiceInProgress = false" /></li>
      </ul>
    </form>
    <ul v-else class="fr-btns-group fr-btns-group--inline-md fr-btns-group--sm">
      <li v-if="blocked">
        <DsfrButton size="sm" secondary icon="fr-icon-user-add-line" :label="assignee ? 'Changer de développeur' : 'Assigner un développeur'" :disabled="action" @click="openChoice" />
      </li>
      <li v-if="assignee">
        <DsfrButton size="sm" tertiary label="Retirer l’assignation" :disabled="action" @click="act(null)" />
      </li>
    </ul>
  </section>
</template>
