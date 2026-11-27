<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Template } from '@/lib/project'
import { useProjetsStore, type RepositoryToAdopt } from '@/stores/projects'

/**
 * Adopt an existing project (#37): the PO chooses a repository of the organization or of their account
 * (the stack is optional). ADA launches the analysis and opens the project at once: the PO follows
 * the assistant there, then approves the adoption.
 */
const props = defineProps<{ templates: Template[] }>()
const emit = defineEmits<{ cancel: []; launched: [id: string, analysis: number | null] }>()
const projects = useProjetsStore()

const repositories = ref<RepositoryToAdopt[] | null>(null)
const repository = ref('')
const template = ref('')
/** Existing code: its appearance is kept by default; the DSFR is an explicit choice. */
const appearance = ref<'projet' | 'dsfr'>('projet')
const appearanceOptions = [
  { label: 'Garder l’apparence du projet (sans DSFR)', value: 'projet', hint: 'ADA réutilise les composants et le style déjà en place.' },
  { label: 'Utiliser le DSFR', value: 'dsfr', hint: 'Système de design de l’État : ADA l’applique aux écrans qu’elle crée ou modifie.' },
]
const repositoryError = ref<string | undefined>()
const error = ref<string | null>(null)
const sendInProgress = ref(false)

const chosen = computed(() => repositories.value?.find((candidate) => candidate.id === repository.value) ?? null)
const accountLabel = (candidate: RepositoryToAdopt) => (candidate.account === 'personal' ? `votre compte ${candidate.owner}` : `organisation ${candidate.owner}`)
const repositoryOptions = computed(() =>
  (repositories.value ?? []).map((candidate) => ({ value: candidate.id, text: `${candidate.name} (${accountLabel(candidate)})` })),
)
/** The stack describes the structure of the code; the appearance is chosen separately. */
const withoutDsfr = (label: string) => label.replace(/,? avec DSFR$/, '').replace(/ DSFR\b/, '')
const templateOptions = computed(() => [
  { value: '', text: 'Je ne sais pas : ADA la déduit' },
  ...props.templates.filter((m) => m.available).map((m) => ({ value: m.id, text: withoutDsfr(m.label) })),
])

async function load(): Promise<void> {
  try {
    repositories.value = await projects.toAdopt()
  } catch (e) {
    error.value = (e as Error).message
  }
}

onMounted(load)

async function adopt(): Promise<void> {
  repositoryError.value = repository.value ? undefined : 'Choisissez le dépôt à reprendre'
  if (repositoryError.value || chosen.value?.adoptionInProgress || chosen.value?.analysisInProgress) return
  sendInProgress.value = true
  error.value = null
  try {
    const result = await projects.adopt(repository.value, template.value || null, appearance.value === 'dsfr')
    const number = Number(result.analysis?.match(/\/issues\/(\d+)$/)?.[1])
    emit('launched', result.id, Number.isInteger(number) ? number : null)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    sendInProgress.value = false
  }
}
</script>

<template>
  <form novalidate aria-labelledby="adoption-title" @submit.prevent="adopt">
    <h2 id="adoption-title" class="fr-h4">Reprendre un projet existant</h2>
    <p class="fr-text--sm">
      Faites évoluer avec ADA un projet déjà commencé, de l’organisation ou de votre compte GitHub.
      ADA l’analyse comme si elle l’avait créé et vous propose des améliorations
      (tests, accessibilité, règles du projet). ADA ouvre ensuite une pull request de reprise : rien
      ne change dans le projet tant que vous ne l’avez pas validée.
    </p>

    <DsfrAlert v-if="error" type="error" small :description="error" class="fr-mb-3w" />
    <p v-if="repositories === null && !error" class="fr-text--sm" role="status">Recherche de vos dépôts…</p>
    <DsfrAlert
      v-else-if="repositories && repositories.length === 0"
      type="info"
      small
      description="Aucun dépôt à reprendre : tous ceux auxquels ADA a accès sont déjà dans l’atelier."
      class="fr-mb-3w"
    />

    <template v-if="repositories && repositories.length">
      <DsfrSelect
        v-model="repository"
        label="Dépôt à reprendre"
        :options="repositoryOptions"
        :error-message="repositoryError"
        default-unselected-text="Choisissez un dépôt"
      />
      <template v-if="chosen?.adoptionInProgress">
        <DsfrAlert type="info" small class="fr-mb-2w" description="Une reprise de ce dépôt attend déjà votre validation : fusionnez sa pull request sur GitHub." />
        <p class="fr-mb-3w">
          <a :href="chosen.adoptionInProgress" target="_blank" rel="noopener">
            Ouvrir la pull request de reprise <span class="fr-sr-only">(nouvelle fenêtre)</span>
          </a>
        </p>
      </template>
      <DsfrAlert
        v-else-if="chosen?.analysisInProgress"
        type="info"
        small
        class="fr-mb-3w"
        description="ADA analyse déjà ce projet : la pull request de reprise s’ouvrira à la fin."
      />
      <template v-else>
        <DsfrSelect
          v-model="template"
          label="Stack la plus proche (facultatif)"
          hint="Si vous la connaissez, ADA part de sa description pour démarrer l’aperçu."
          :options="templateOptions"
        />
        <DsfrRadioButtonSet v-model="appearance" name="appearance" legend="Apparence" :options="appearanceOptions" />
      </template>
    </template>

    <p id="adoption-saving" class="fr-text--sm">
      <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
      <strong>ADA enregistre la demande d’analyse sur GitHub, à votre nom</strong>, puis ajoute s’ils
      manquent les formulaires de story et de signalement, la description de l’aperçu
      (<code>ada.json</code>) et les versions automatiques.
    </p>
    <p class="fr-text--sm">
      Votre dépôt n’apparaît pas ? ADA doit y avoir accès :
      <a href="https://github.com/settings/installations" target="_blank" rel="noopener">
        autorisez l’application ADA sur ce compte <span class="fr-sr-only">(nouvelle fenêtre)</span>
      </a>.
    </p>

    <p v-if="sendInProgress" class="fr-text--sm" role="status">ADA prépare la reprise et lance l’analyse…</p>
    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li v-if="repositories && repositories.length && !chosen?.adoptionInProgress && !chosen?.analysisInProgress">
        <DsfrButton type="submit" label="Analyser et reprendre" aria-describedby="adoption-saving" :disabled="sendInProgress" />
      </li>
      <li><DsfrButton type="button" secondary label="Annuler" @click="emit('cancel')" /></li>
    </ul>
  </form>
</template>
