<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { api } from '@/services/api'

interface VersionItem {
  text: string
  workRequest: number | null
}

interface Versions {
  current: { version: string; url: string; at: string | null } | null
  proposed: {
    version: string | null
    pullRequestNumber: number
    url: string
    features: VersionItem[]
    fixes: VersionItem[]
    others: VersionItem[]
    publishable: boolean
    reason: string | null
  } | null
}

const props = defineProps<{ project: string }>()

const versions = ref<Versions | null>(null)
const open = ref(false)
const publication = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

const filePath = () => `/projects/${encodeURIComponent(props.project)}/versions`

async function load(): Promise<void> {
  error.value = null
  try {
    versions.value = await api.read<Versions>(filePath())
  } catch (e) {
    error.value = (e as Error).message
  }
}

/** Reads the versions again without clearing the displayed error message. */
async function review(): Promise<void> {
  try {
    versions.value = await api.read<Versions>(filePath())
  } catch {
    /* still unavailable: the displayed error is enough */
  }
}

async function publish(): Promise<void> {
  const version = versions.value?.proposed?.version
  publication.value = true
  error.value = null
  try {
    versions.value = await api.send<Versions>(`${filePath()}/publish`, {})
    message.value = `La version ${version} est publiée. Sa page sur GitHub apparaîtra dans une minute.`
    open.value = false
  } catch (e) {
    error.value = (e as Error).message
    // The publication may have succeeded despite the error (lost response): the real state is read again.
    setTimeout(() => void review(), 4000)
  } finally {
    publication.value = false
  }
}

onMounted(load)
watch(
  () => props.project,
  () => {
    message.value = null
    open.value = false
    void load()
  },
)
defineExpose({ load })
</script>

<template>
  <section class="versions fr-mb-2w" aria-labelledby="versions-title">
    <h2 id="versions-title" class="fr-h6 fr-mb-1w">Versions</h2>
    <DsfrAlert v-if="error" type="error" small :description="error" />
    <p v-else-if="!versions" class="fr-text--sm fr-mb-0">Lecture des versions…</p>
    <template v-else>
      <p class="fr-text--sm fr-mb-1w">
        Version actuelle :
        <a v-if="versions.current" :href="versions.current.url" target="_blank" rel="noopener">
          {{ versions.current.version }}<span class="fr-sr-only"> (nouvelle fenêtre)</span>
        </a>
        <span v-else>aucune version publiée</span>
      </p>
      <p v-if="message" class="fr-text--sm fr-mb-1w" role="status">{{ message }}</p>

      <div v-if="versions.proposed">
        <DsfrButton
          size="sm"
          secondary
          :label="open ? 'Masquer le récapitulatif' : `Nouvelle version prête : ${versions.proposed.version}`"
          @click="open = !open"
        />
        <div v-if="open" class="fr-mt-2w">
          <h3 class="fr-text--md fr-mb-1w">Ce que contient la version {{ versions.proposed.version }}</h3>
          <template v-if="versions.proposed.features.length">
            <p class="fr-text--sm fr-mb-1v"><strong>Nouveautés</strong></p>
            <ul class="fr-text--sm">
              <li v-for="element in versions.proposed.features" :key="element.text">
                {{ element.text }}<span v-if="element.workRequest"> (story #{{ element.workRequest }})</span>
              </li>
            </ul>
          </template>
          <template v-if="versions.proposed.fixes.length">
            <p class="fr-text--sm fr-mb-1v"><strong>Corrections</strong></p>
            <ul class="fr-text--sm">
              <li v-for="element in versions.proposed.fixes" :key="element.text">
                {{ element.text }}<span v-if="element.workRequest"> (problème #{{ element.workRequest }})</span>
              </li>
            </ul>
          </template>
          <p class="fr-text--xs">
            Publier crée une version figée du projet, avec son journal des changements, que vous
            pouvez montrer ou retrouver plus tard. Rien n’est mis en production.
          </p>
          <DsfrAlert v-if="!versions.proposed.publishable && versions.proposed.reason" type="warning" small :description="versions.proposed.reason" class="fr-mb-1w" />
          <DsfrButton
            :label="publication ? 'Publication…' : `Publier la version ${versions.proposed.version}`"
            :disabled="!versions.proposed.publishable || publication"
            @click="publish"
          />
        </div>
      </div>
    </template>
  </section>
</template>
