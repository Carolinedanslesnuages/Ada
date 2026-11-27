<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '@/services/api'
import { CHECK_LABELS, type Verification } from '@/lib/story'

/**
 * Project being adopted (#37): the assistant analyses it, then the PO approves the adoption PR
 * right here. Its improvement proposals are in the analysis request, in the list.
 */
type AdoptionState = Verification & { analysisInProgress: boolean }

const props = defineProps<{ project: string; pollingInterval?: number }>()
const emit = defineEmits<{ merged: [] }>()

const state = ref<AdoptionState | null>(null)
const error = ref<string | null>(null)
const mergeInProgress = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
const filePath = () => `/projects/${encodeURIComponent(props.project)}/adoption`

async function load(): Promise<void> {
  try {
    state.value = await api.read<AdoptionState>(filePath())
    error.value = null
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function rerunChecks(): Promise<void> {
  mergeInProgress.value = true
  try {
    state.value = await api.send<AdoptionState>(`${filePath()}/checks/relaunch`, {})
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    mergeInProgress.value = false
  }
}

async function merge(): Promise<void> {
  mergeInProgress.value = true
  try {
    state.value = await api.send<AdoptionState>(`${filePath()}/merge`, {})
    emit('merged')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    mergeInProgress.value = false
  }
}

function poll(): void {
  if (timer) clearInterval(timer)
  void load()
  timer = setInterval(() => void load(), props.pollingInterval ?? 10000)
}
onMounted(poll)
watch(() => props.project, poll)
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="fr-mb-3w" aria-labelledby="pending-adoption-title">
    <h2 id="pending-adoption-title" class="fr-h6 fr-mb-1w">Reprise du projet</h2>
    <div role="status">
      <p v-if="!state && !error" class="fr-text--sm">Chargement de la reprise…</p>
      <DsfrAlert
        v-else-if="state?.analysisInProgress && !state.pullRequest"
        type="info"
        small
        description="ADA analyse le projet comme si elle l’avait créé (quelques minutes). Suivez-la dans la demande d’analyse ci-dessous : elle y proposera ses améliorations, puis la reprise sera à valider ici."
      />
      <DsfrAlert
        v-else-if="state && !state.pullRequest"
        type="warning"
        small
        description="L’analyse s’est arrêtée sans pull request de reprise : ADA explique pourquoi dans la demande d’analyse ci-dessous."
      />
      <DsfrAlert
        v-else-if="state?.pullRequest?.state === 'merged'"
        type="success"
        small
        description="Reprise validée : le projet suit maintenant les règles d’ADA. Choisissez les améliorations à publier dans la demande d’analyse."
      />
      <DsfrAlert
        v-else-if="state?.pullRequest"
        type="info"
        small
        description="À vous de valider la reprise : ADA ajoute au projet les formulaires de story, la description de l’aperçu et les versions automatiques. Les demandes pourront être lancées ensuite."
      />
    </div>
    <DsfrAlert v-if="error" type="error" small :description="error" class="fr-mt-1w" />

    <template v-if="state?.pullRequest && state.pullRequest.state === 'open'">
      <ul class="fr-mt-1w fr-mb-1w fr-text--sm">
        <li v-for="check in state.checks" :key="check.name">{{ check.name }} : {{ CHECK_LABELS[check.state] }}</li>
      </ul>
      <p v-if="!state.mergeable && state.reason" class="fr-text--sm">{{ state.reason }}</p>
      <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--sm fr-btns-group--icon-left">
        <li>
          <DsfrButton label="Valider et fusionner la reprise" :disabled="!state.mergeable || mergeInProgress" @click="merge" />
        </li>
        <li v-if="state.checks.some((check) => check.state === 'not-launched')">
          <DsfrButton secondary icon="fr-icon-refresh-line" label="Relancer les contrôles" :disabled="mergeInProgress" @click="rerunChecks" />
        </li>
        <li>
          <a class="fr-btn fr-btn--secondary fr-btn--sm" :href="state.pullRequest.url" target="_blank" rel="noopener">
            Voir la pull request <span class="fr-sr-only">(nouvelle fenêtre)</span>
          </a>
        </li>
      </ul>
    </template>
  </section>
</template>
