<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, ApiError } from '@/services/api'

/** “My model”: the language model ADA works with for the user (address, key, name). */
interface ViewedModel {
  configure: boolean
  address: string
  model: string
  /** Last characters of the key: the key itself is never returned. */
  endKey: string | null
  defaults: string | null
}
interface TestResult {
  ok: boolean
  toolCalls: boolean
  message: string
}

const seen = ref<ViewedModel | null>(null)
const address = ref('')
const key = ref('')
const model = ref('')
const errors = ref<Record<string, string>>({})
const generalError = ref<string | null>(null)
const confirmation = ref<string | null>(null)
const test = ref<TestResult | null>(null)
const inProgress = ref<'enregistrer' | 'test' | 'retirer' | null>(null)

function apply(value: ViewedModel): void {
  seen.value = value
  address.value = value.address
  model.value = value.model
  key.value = ''
}

const input = () => ({ address: address.value, key: key.value, model: model.value })

async function act(action: 'enregistrer' | 'test' | 'retirer', work: () => Promise<void>): Promise<void> {
  inProgress.value = action
  errors.value = {}
  generalError.value = null
  confirmation.value = null
  if (action !== 'test') test.value = null
  try {
    await work()
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.errors).length > 0) errors.value = e.errors
    else generalError.value = (e as Error).message
  } finally {
    inProgress.value = null
  }
}

onMounted(async () => {
  try {
    apply(await api.read<ViewedModel>('/model'))
  } catch (e) {
    generalError.value = (e as Error).message
  }
})

const save = () =>
  act('enregistrer', async () => {
    apply(await api.replaceWith<ViewedModel>('/model', input()))
    confirmation.value = 'Votre modèle est enregistré : ADA travaillera avec lui pour vos demandes.'
  })

const runTest = () =>
  act('test', async () => {
    test.value = await api.send<TestResult>('/model/test', input())
  })

const remove = () =>
  act('retirer', async () => {
    apply(await api.remove<ViewedModel>('/model'))
    confirmation.value = 'Votre modèle est retiré : ADA travaille de nouveau avec son modèle par défaut.'
  })
</script>

<template>
  <div class="fr-grid-row fr-grid-row--center">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <h1 class="fr-h3">Mon modèle</h1>
      <p>
        Par défaut, ADA travaille avec son modèle<template v-if="seen?.defaults"> (« {{ seen.defaults }} »)</template>. Vous pouvez la faire
        travailler avec le vôtre : indiquez l’adresse de votre passerelle (compatible OpenAI), votre clé et le nom du modèle.
      </p>
      <p v-if="seen" class="fr-badge fr-badge--no-icon" :class="seen.configure ? 'fr-badge--success' : 'fr-badge--info'" role="status">
        {{ seen.configure ? `Votre modèle est utilisé : ${seen.model}` : 'Modèle par défaut d’ADA' }}
      </p>

      <DsfrAlert v-if="generalError" type="error" small :description="generalError" class="fr-my-2w" />
      <DsfrAlert v-if="confirmation" type="success" small :description="confirmation" class="fr-my-2w" role="status" />

      <form novalidate class="fr-mt-3w" @submit.prevent="save">
        <DsfrInputGroup
          id="model-address"
          v-model="address"
          label="Adresse de la passerelle"
          hint="Exemple : https://llm.mon-organisation.fr/v1"
          label-visible
          :error-message="errors.address"
          autocomplete="off"
        />
        <DsfrInputGroup
          id="model-key"
          v-model="key"
          type="password"
          label="Clé d’API"
          :hint="seen?.endKey ? `Une clé est enregistrée (${seen.endKey}). Laissez vide pour la garder.` : 'Facultative pour une passerelle sans clé.'"
          label-visible
          :error-message="errors.key"
          autocomplete="off"
        />
        <DsfrInputGroup
          id="model-name"
          v-model="model"
          label="Nom du modèle"
          hint="Tel que la passerelle le désigne, par exemple glm-5."
          label-visible
          :error-message="errors.model"
          autocomplete="off"
        />

        <p class="fr-text--sm">
          <span class="fr-icon-lock-line fr-icon--sm" aria-hidden="true" />
          Votre clé est chiffrée sur le serveur d’ADA et n’est jamais affichée ni transmise au projet : seule la passerelle que
          vous indiquez la reçoit.
        </p>

        <ul class="fr-btns-group fr-btns-group--inline-md">
          <li><DsfrButton type="submit" label="Enregistrer" :disabled="inProgress !== null" /></li>
          <li>
            <DsfrButton type="button" secondary :label="inProgress === 'test' ? 'Essai en cours…' : 'Tester la connexion'" :disabled="inProgress !== null" @click="runTest" />
          </li>
          <li v-if="seen?.configure">
            <DsfrButton type="button" tertiary label="Revenir au modèle par défaut" :disabled="inProgress !== null" @click="remove" />
          </li>
        </ul>
      </form>

      <DsfrAlert
        v-if="test"
        :type="test.ok && test.toolCalls ? 'success' : test.ok ? 'warning' : 'error'"
        small
        :description="test.message"
        class="fr-mt-2w"
        role="status"
      />
    </div>
  </div>
</template>
