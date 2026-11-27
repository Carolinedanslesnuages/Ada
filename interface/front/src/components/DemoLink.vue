<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { api } from '@/services/api'

interface Demo {
  state: 'stopped' | 'starting' | 'ready' | 'error'
  url: string | null
  isPreviewStarted: boolean
}

/**
 * Demo link to share: the last approved version of the project, open to everyone
 * without sign-in (fictitious data only, ADA's rule).
 */
const props = defineProps<{ project: string; isPreviewReady: boolean; intervalMs?: number }>()

const demo = ref<Demo | null>(null)
const error = ref<string | null>(null)
const message = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

const filePath = computed(() => `/projects/${encodeURIComponent(props.project)}/demo`)
const available = computed(() => props.isPreviewReady && demo.value?.state === 'ready' && Boolean(demo.value.url))
const inPreparation = computed(() => demo.value?.state === 'starting')
const explanation = computed(() => {
  if (!props.isPreviewReady) return 'Disponible quand l’aperçu du projet est démarré.'
  if (inPreparation.value) return 'Préparation du lien de démonstration… (une à deux minutes la première fois)'
  if (demo.value?.state === 'error') return 'Le lien de démonstration ne démarre pas : réessayez, ou prévenez un développeur.'
  return 'Montre la dernière version validée (pas le travail en cours), ouverte à tous sans connexion.'
})

function stopPolling(): void {
  if (timer) clearTimeout(timer)
  timer = null
}

function poll(): void {
  stopPolling()
  timer = setTimeout(async () => {
    try {
      demo.value = await api.read<Demo>(filePath.value)
      if (demo.value.state === 'starting') poll()
    } catch (e) {
      error.value = (e as Error).message
    }
  }, props.intervalMs ?? 3000)
}

async function read(): Promise<void> {
  try {
    demo.value = await api.read<Demo>(filePath.value)
    if (demo.value.state === 'starting') poll()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function prepare(): Promise<void> {
  error.value = null
  demo.value = { state: 'starting', url: null, isPreviewStarted: true }
  try {
    demo.value = await api.send<Demo>(filePath.value, {})
    if (demo.value.state === 'starting') poll()
  } catch (e) {
    demo.value = null
    error.value = (e as Error).message
  }
}

async function copy(): Promise<void> {
  if (!demo.value?.url) return
  try {
    await navigator.clipboard.writeText(demo.value.url)
    message.value = `Lien copié : ${demo.value.url}`
  } catch {
    message.value = `Copiez ce lien : ${demo.value.url}`
  }
}

watch(
  () => [props.project, props.isPreviewReady] as const,
  () => {
    stopPolling()
    message.value = ''
    error.value = null
    if (props.isPreviewReady) void read()
    else demo.value = null
  },
  { immediate: true },
)
onUnmounted(stopPolling)
</script>

<template>
  <div class="demo-link fr-mb-2w">
    <DsfrButton
      v-if="available"
      size="sm"
      secondary
      icon="fr-icon-links-line"
      label="Copier le lien de démonstration"
      aria-describedby="demo-link-help"
      @click="copy"
    />
    <DsfrButton
      v-else-if="isPreviewReady && !inPreparation && demo?.state !== undefined"
      size="sm"
      secondary
      icon="fr-icon-links-line"
      label="Préparer le lien de démonstration"
      aria-describedby="demo-link-help"
      @click="prepare"
    />
    <DsfrButton
      v-else
      size="sm"
      secondary
      icon="fr-icon-links-line"
      label="Copier le lien de démonstration"
      aria-describedby="demo-link-help"
      disabled
    />
    <p id="demo-link-help" class="fr-hint-text fr-mt-1v fr-mb-0">
      {{ explanation }}
      <a v-if="available && demo?.url" class="fr-link fr-link--sm" :href="demo.url" target="_blank" rel="noopener">
        {{ demo.url }}<span class="fr-sr-only"> (nouvelle fenêtre)</span>
      </a>
    </p>
    <p class="fr-text--sm fr-mb-0" role="status">{{ message }}</p>
    <DsfrAlert v-if="error" type="error" small :description="error" class="fr-mt-1w" />
  </div>
</template>
