<script setup lang="ts">
import { computed, ref } from 'vue'
import DictateButton from '@/components/DictateButton.vue'
import ProjectFootprint from '@/components/ProjectFootprint.vue'
import { MAX_MESSAGE_LENGTH, toLaunchOrRelaunch, orderToLaunch, type StorySummary } from '@/lib/story'

/**
 * Home of a project, Gemini style: a large “Que fait-on ?” area that opens a conversation
 * with ADA, and a few suggestions (the advised story, a guided request).
 */
const props = defineProps<{
  projectName: string
  /** Identifier of the project: to read its estimated carbon footprint. */
  project?: string | null
  stories: StorySummary[]
  /** Request in progress: only one at a time, going to it is offered rather than opening another. */
  active: StorySummary | null
  sendInProgress?: boolean
  serverError?: string | null
}>()
const emit = defineEmits<{ conversation: [text: string]; open: [number: number]; guided: [] }>()

const advised = computed(() => orderToLaunch(props.stories.filter(toLaunchOrRelaunch)).find((story) => story.ready && story.status === 'new') ?? null)

const text = ref('')
const localError = ref('')
const error = computed(() => localError.value || props.serverError || '')

function send(): void {
  const clean = text.value.trim()
  if (clean.length < 10) {
    localError.value = 'Dites à ADA ce que vous voulez faire, en une phrase au moins'
    return
  }
  if (clean.length > MAX_MESSAGE_LENGTH) {
    localError.value = `${MAX_MESSAGE_LENGTH} caractères au maximum par message : envoyez la suite dans un autre message`
    return
  }
  localError.value = ''
  emit('conversation', clean)
}

/** Dictation: each recognized sentence is appended to the message. */
function addDictation(phrase: string): void {
  text.value = text.value.trim() ? `${text.value.trimEnd()} ${phrase}` : phrase
}

/** Enter sends, Shift+Enter breaks the line: as in messaging apps. */
function key(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    send()
  }
}
</script>

<template>
  <section class="home" aria-labelledby="home-title">
    <h2 id="home-title" class="home__title">Que fait-on sur {{ projectName }} ?</h2>

    <div v-if="active" class="fr-callout home__busy">
      <p class="fr-callout__text fr-text--sm">
        <strong>#{{ active.number }} « {{ active.title }} »</strong> est en cours : une demande à la fois.
      </p>
      <DsfrButton size="sm" secondary label="Y aller" @click="emit('open', active.number)" />
    </div>

    <form v-else novalidate class="input-area" @submit.prevent="send">
      <label class="fr-sr-only" for="home-message">Votre message à ADA</label>
      <textarea
        id="home-message"
        v-model="text"
        class="input-area__text"
        rows="3"
        placeholder="Décrivez ce que vous voulez : une page, un changement, une question…"
        :aria-describedby="error ? 'home-error home-help' : 'home-help'"
        :aria-invalid="error ? 'true' : undefined"
        @keydown="key"
      />
      <div class="input-area__bottom">
        <p id="home-help" class="fr-text--xs fr-mb-0">
          ADA agit tout de suite sur une copie à part. Rien n’arrive sur le projet avant votre « c’est bon ».
        </p>
        <span class="input-area__actions">
          <DictateButton field="home-message" @text="addDictation" />
          <DsfrButton type="submit" icon="fr-icon-send-plane-fill" :label="sendInProgress ? 'Envoi…' : 'Envoyer'" :disabled="sendInProgress" />
        </span>
      </div>
      <p v-if="error" id="home-error" class="fr-error-text fr-mt-1w" role="alert">{{ error }}</p>
    </form>

    <ul v-if="!active" class="suggestions" aria-label="Suggestions">
      <li v-if="advised">
        <button type="button" class="suggestion" @click="emit('open', advised.number)">
          <span class="fr-icon-play-line fr-icon--sm" aria-hidden="true" />
          Story conseillée : #{{ advised.number }} {{ advised.title }}
        </button>
      </li>
      <li>
        <button type="button" class="suggestion" @click="emit('guided')">
          <span class="fr-icon-list-ordered fr-icon--sm" aria-hidden="true" />
          Demande guidée, avec un plan à valider
        </button>
      </li>
    </ul>

    <ProjectFootprint v-if="project" :project="project" />
  </section>
</template>

<style scoped>
.home {
  max-width: 44rem;
  margin: 12vh auto 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.home__title {
  font-size: 1.75rem;
  text-align: center;
  margin: 0;
}

.input-area {
  border: 1px solid var(--border-default-grey);
  border-radius: 1rem;
  padding: 0.75rem 0.75rem 0.5rem 1rem;
  background: var(--background-default-grey);
  box-shadow: 0 2px 8px rgb(0 0 18 / 8%);
}

.input-area:focus-within {
  outline: 2px solid #0a76f6;
  outline-offset: 2px;
}

.input-area__text {
  width: 100%;
  border: 0;
  resize: vertical;
  background: transparent;
  font: inherit;
  outline: none;
}

.input-area__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.input-area__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.suggestions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.suggestions li {
  padding: 0;
}

.suggestion {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border-default-grey);
  border-radius: 2rem;
  background: var(--background-default-grey);
  font-size: 0.875rem;
  cursor: pointer;
}

.suggestion:hover {
  background: var(--background-default-grey-hover);
}

.home__busy :deep(button) {
  flex-shrink: 0;
  white-space: nowrap;
}

.home__busy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
</style>
