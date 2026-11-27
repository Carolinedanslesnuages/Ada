<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

/**
 * “Dictate”: for those who can click but not type. Speech recognition of the browser, in
 * French; each recognized sentence is added to the message. Absent if the browser does not offer
 * it (Firefox). The audio is processed by the browser's service (Google for Chrome, Microsoft
 * for Edge, Apple for Safari): the person is informed of it.
 * Those who can neither type nor click drive ADA with their system's tool (Voice Control,
 * Voice Access, Dragon): every button carries a visible label to say for that purpose.
 */
const props = defineProps<{ field: string }>()
const emit = defineEmits<{ text: [phrase: string] }>()

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionConstructor = new () => Recognition

const windowObject = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
const Constructor = windowObject.SpeechRecognition ?? windowObject.webkitSpeechRecognition
const available = Boolean(Constructor)

const listening = ref(false)
const error = ref('')
let recognition: Recognition | null = null

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Le micro est refusé : autorisez-le pour ADA dans les réglages du navigateur.',
  'no-speech': 'Je n’ai rien entendu. Cliquez sur « Dicter » et parlez.',
  network: 'La dictée a besoin d’internet : vérifiez la connexion.',
}

function stop(): void {
  recognition?.stop()
}

function toggle(): void {
  if (listening.value) {
    stop()
    return
  }
  if (!Constructor) return
  error.value = ''
  recognition = new Constructor()
  recognition.lang = 'fr-FR'
  recognition.continuous = true
  recognition.interimResults = false
  recognition.onresult = (event) => {
    for (let rank = event.resultIndex; rank < event.results.length; rank++) {
      const result = event.results[rank]!
      const phrase = result[0].transcript.trim()
      if (result.isFinal && phrase) emit('text', phrase)
    }
  }
  recognition.onerror = (event) => {
    if (event.error !== 'aborted') error.value = ERROR_MESSAGES[event.error] ?? 'La dictée s’est arrêtée. Réessayez.'
  }
  recognition.onend = () => {
    listening.value = false
  }
  recognition.start()
  listening.value = true
}

onUnmounted(stop)
</script>

<template>
  <span v-if="available" class="dictate">
    <DsfrButton
      type="button"
      size="sm"
      tertiary
      :icon="listening ? 'fr-icon-stop-circle-line' : 'fr-icon-mic-line'"
      :label="listening ? 'Arrêter la dictée' : 'Dicter'"
      :aria-controls="props.field"
      title="L’audio est traité par le service de reconnaissance de votre navigateur"
      @click="toggle"
    />
    <span class="fr-sr-only" role="status">{{ listening ? 'Dictée en cours : parlez. Cliquez sur « Arrêter la dictée » pour finir.' : '' }}</span>
    <span v-if="error" class="fr-error-text fr-text--xs fr-mt-0" role="alert">{{ error }}</span>
  </span>
</template>

<style scoped>
.dictate {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
}
</style>
