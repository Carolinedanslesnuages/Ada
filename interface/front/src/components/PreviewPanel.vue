<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { api } from '@/services/api'
import DemoLink from '@/components/DemoLink.vue'

interface Preview {
  state: 'stopped' | 'starting' | 'ready' | 'error'
  url: string | null
  log: string | null
}

/**
 * `pending`: the preview cannot start yet (adoption to approve); the text explains it.
 * `collapsible`: displayed enlarged, with a button to go back to the conversation.
 */
const props = defineProps<{ project: string | null; intervalMs?: number; signOfLifeMs?: number; pending?: string | null; collapsible?: boolean }>()
const emit = defineEmits<{ collapse: []; address: [url: string | null] }>()

const preview = ref<Preview | null>(null)
const error = ref<string | null>(null)
const key = ref(0)
let timer: ReturnType<typeof setTimeout> | null = null

const filePath = (project: string) => `/projects/${encodeURIComponent(project)}/preview`

function stopPolling(): void {
  if (timer) clearTimeout(timer)
  timer = null
  if (keepAliveTimer) clearInterval(keepAliveTimer)
  keepAliveTimer = null
}

/*
 * Sign of life: as long as the preview is displayed, ADA knows it (it is not put to sleep). If it
 * was put to sleep in the meantime (tab left open overnight), it is restarted automatically.
 */
let keepAliveTimer: ReturnType<typeof setInterval> | null = null
function keepAlive(project: string): void {
  if (keepAliveTimer) clearInterval(keepAliveTimer)
  keepAliveTimer = setInterval(async () => {
    if (props.project !== project) return
    try {
      const state = await api.read<Preview>(filePath(project))
      if (state.state === 'stopped') void start(project)
    } catch {
      // transient network issue: retried at the next sign of life
    }
  }, props.signOfLifeMs ?? 60_000)
}

/** Polls the state until the application responds (or fails). */
function poll(project: string): void {
  stopPolling()
  timer = setTimeout(async () => {
    if (props.project !== project) return
    try {
      preview.value = await api.read<Preview>(filePath(project))
      if (preview.value.state === 'starting') poll(project)
    } catch (e) {
      error.value = (e as Error).message
    }
  }, props.intervalMs ?? 3000)
}

async function start(project: string): Promise<void> {
  error.value = null
  preview.value = { state: 'starting', url: null, log: null }
  try {
    preview.value = await api.send<Preview>(filePath(project), {})
    if (preview.value.state === 'starting') poll(project)
    keepAlive(project)
  } catch (e) {
    preview.value = null
    error.value = (e as Error).message
  }
}

function reload(): void {
  key.value++
}

watch(
  () => [props.project, props.pending] as const,
  ([project, pending]) => {
    stopPolling()
    preview.value = null
    if (project && !pending) void start(project)
  },
  { immediate: true },
)

/* The workshop offers “Ouvrir dans un onglet” from the conversation: it needs the address. */
watch(
  () => (preview.value?.state === 'ready' ? preview.value.url : null),
  (url) => emit('address', url),
  { immediate: true },
)

onUnmounted(stopPolling)
</script>

<template>
  <section class="workshop__panel" aria-labelledby="preview-title">
    <div class="fr-grid-row fr-grid-row--middle fr-grid-row--gutters">
      <h2 id="preview-title" class="fr-h4 fr-mb-0 fr-col" tabindex="-1">Aperçu</h2>
      <div class="fr-col-auto">
        <ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm fr-btns-group--icon-left">
          <li v-if="collapsible">
            <DsfrButton size="sm" icon="fr-icon-arrow-left-line" label="Revenir à la conversation" @click="emit('collapse')" />
          </li>
          <template v-if="preview?.state === 'ready' && preview.url">
          <li>
            <DsfrButton size="sm" tertiary icon="fr-icon-refresh-line" label="Recharger" @click="reload" />
          </li>
          <li>
            <a class="fr-btn fr-btn--sm fr-btn--tertiary" :href="preview.url" target="_blank" rel="noopener">
              Ouvrir dans un onglet<span class="fr-sr-only"> (nouvelle fenêtre)</span>
            </a>
          </li>
          </template>
        </ul>
      </div>
    </div>

    <DemoLink v-if="project" :project="project" :is-preview-ready="preview?.state === 'ready'" />

    <iframe
      v-if="preview?.state === 'ready' && preview.url"
      :key="key"
      class="preview preview--frame"
      :src="preview.url"
      :title="`Aperçu de l’application ${project}`"
    />

    <div v-else class="preview" role="status">
      <p v-if="!project">Choisissez un projet pour afficher son aperçu.</p>
      <p v-else-if="pending">{{ pending }}</p>
      <DsfrAlert v-else-if="error" type="error" small :description="error" />
      <div v-else-if="preview?.state === 'error'">
        <DsfrAlert
          type="error"
          small
          description="L’application ne démarre pas. Si le problème persiste, prévenez un développeur avec le journal ci-dessous."
        />
        <pre v-if="preview.log" class="fr-text--xs fr-mt-2w log">{{ preview.log }}</pre>
        <DsfrButton class="fr-mt-2w" size="sm" label="Réessayer" @click="start(project)" />
      </div>
      <p v-else>
        Préparation de l’aperçu de « {{ project }} »… La première fois, l’installation prend
        une à deux minutes.
      </p>
    </div>
  </section>
</template>
