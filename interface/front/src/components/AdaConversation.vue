<script setup lang="ts">
import DictateButton from '@/components/DictateButton.vue'
import BreakdownProposal from '@/components/BreakdownProposal.vue'
import RichText from '@/components/RichText.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { readBreakdown, ASSISTANT_MARKER, LAUNCH_MARKER, MAX_MESSAGE_LENGTH, presentMessage, type StoryDetail, type ProposedStory } from '@/lib/story'

/**
 * Conversation (“real prompt”): every exchange in order, then, when ADA has answered, the
 * PO's next message, “all good” (propose the changes to the project) or “stop”. Stories
 * for later proposed by ADA in its last message are chosen here; ADA publishes them.
 */
const props = defineProps<{ story: StoryDetail; awaitsAnswer: boolean; actionInProgress?: boolean }>()
const emit = defineEmits<{ send: [text: string]; finish: []; stop: []; createStories: [stories: ProposedStory[]] }>()

/** Stories proposed by ADA in its last message (once published, the next message removes them). */
const proposedStories = computed(() => {
  const last = props.story.messages[props.story.messages.length - 1]
  return last?.text.startsWith(ASSISTANT_MARKER) ? readBreakdown(last.text) : []
})

const exchanges = computed(() => [
  ...(props.story.freeContent ? [{ id: 0, author: 'Vous', text: props.story.freeContent, assistant: false, at: props.story.createdAt }] : []),
  ...props.story.messages
    .filter((message) => !message.text.startsWith(LAUNCH_MARKER))
    .map((message) => ({ id: message.id, at: message.at, ...presentMessage(message) })),
])

/* As in a messaging app: the view lands on the last message, and returns to it at each answer. */
const list = ref<HTMLOListElement | null>(null)
watch(
  () => exchanges.value.length,
  async () => {
    await nextTick()
    list.value?.lastElementChild?.scrollIntoView?.({ block: 'nearest' })
  },
  { immediate: true },
)

const text = ref('')
const error = ref('')
const confirmStop = ref(false)
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

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

function send(): void {
  const clean = text.value.trim()
  if (!clean) {
    error.value = 'Écrivez votre message à ADA'
    return
  }
  if (clean.length > MAX_MESSAGE_LENGTH) {
    error.value = `${MAX_MESSAGE_LENGTH} caractères au maximum par message : envoyez la suite dans un autre message`
    return
  }
  error.value = ''
  emit('send', clean)
  text.value = ''
}
</script>

<template>
  <section class="fr-mb-1w" aria-labelledby="conversation-title">
    <h3 id="conversation-title" class="fr-h6 fr-mb-1w">Conversation avec ADA</h3>
    <ol ref="list" class="feed conversation">
      <li v-for="message in exchanges" :key="message.id" :class="{ feed__assistant: message.assistant, conversation__po: !message.assistant }">
        <p class="fr-text--xs fr-mb-1v">
          <strong>{{ message.assistant ? 'ADA' : message.author }}</strong> — {{ date(message.at) }}
        </p>
        <RichText :text="message.text" />
      </li>
    </ol>

    <BreakdownProposal
      v-if="awaitsAnswer && proposedStories.length"
      :key="`stories-${story.messages.length}`"
      class="fr-mb-2w"
      :stories="proposedStories"
      :designation="`la conversation n° ${story.number}`"
      :action-in-progress="actionInProgress"
      :other-breakdown="false"
      @create="(stories) => emit('createStories', stories)"
    />

    <div v-if="awaitsAnswer" class="message-area">
      <form novalidate class="input-area" @submit.prevent="send">
        <label class="fr-sr-only" for="conversation-message">Votre message à ADA</label>
        <textarea
          id="conversation-message"
          v-model="text"
          class="input-area__text"
          rows="2"
          placeholder="Répondez à ADA, demandez un autre changement…"
          :aria-describedby="error ? 'conversation-error message-saving' : 'message-saving'"
          :aria-invalid="error ? 'true' : undefined"
          @keydown="key"
        />
        <div class="input-area__bottom">
          <p id="message-saving" class="fr-text--xs fr-mb-0">Enregistré sur GitHub, à votre nom.</p>
          <span class="input-area__actions">
            <DictateButton field="conversation-message" @text="addDictation" />
            <DsfrButton type="submit" icon="fr-icon-send-plane-fill" label="Envoyer" :disabled="actionInProgress" />
          </span>
        </div>
      </form>
      <p v-if="error" id="conversation-error" class="fr-error-text fr-mt-1w" role="alert">{{ error }}</p>

      <div v-if="!confirmStop" class="conclude">
        <DsfrButton
          size="sm"
          secondary
          icon="fr-icon-check-line"
          label="C’est bon : proposer ces changements"
          title="ADA propose ses changements au projet : ils passent les contrôles, puis vous les ajoutez"
          :disabled="actionInProgress"
          @click="emit('finish')"
        />
        <DsfrButton size="sm" tertiary no-outline label="Arrêter la conversation" :disabled="actionInProgress" @click="confirmStop = true" />
      </div>
      <div v-else class="conclude" role="group" aria-labelledby="stop-question">
        <p id="stop-question" class="fr-text--sm fr-mb-0">
          <strong>Arrêter ?</strong> Rien de ce qu’ADA a fait ne sera ajouté au projet.
        </p>
        <DsfrButton size="sm" label="Oui, arrêter" :disabled="actionInProgress" @click="emit('stop')" />
        <DsfrButton size="sm" secondary label="Non, continuer" @click="confirmStop = false" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.conversation__po {
  margin-left: 2rem;
}

/* The message area stays stuck at the bottom while the conversation is read again. */
.message-area {
  position: sticky;
  bottom: 0;
  z-index: 1;
  padding: 0.75rem 0 0.5rem;
  background: var(--background-default-grey);
}

.input-area {
  border: 1px solid var(--border-default-grey);
  border-radius: 1rem;
  padding: 0.5rem 0.5rem 0.375rem 0.875rem;
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

.input-area__bottom,
.conclude {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.input-area__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.conclude {
  justify-content: flex-start;
  margin-top: 0.5rem;
}
</style>
