<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef, watch } from 'vue'
import {
  type StackAdvice,
  type ProjectFamily,
  type ProjectTypeOption,
  type ProjectType,
  normalizeName,
  slugify,
  validateProjectForm,
  type ProjectErrors,
  type Template,
  type NewProject,
} from '@/lib/project'

const props = defineProps<{
  families: ProjectFamily[]
  types: ProjectTypeOption[]
  templates: Template[]
  serverErrors?: ProjectErrors | null
  /** The assistant proposes a stack from the idea (#68); absent: no advice button. */
  adviser?: (idea: string) => Promise<StackAdvice>
  sendInProgress?: boolean
}>()
const emit = defineEmits<{ submit: [project: NewProject]; cancel: [] }>()

const project = reactive<NewProject>({ name: '', idea: '', objective: '', template: '', baseline: '', deployed: false, visibility: 'private' })
const localErrors = ref<ProjectErrors>({})
const errors = computed<ProjectErrors>(() => ({ ...localErrors.value, ...props.serverErrors }))
const address = computed(() => slugify(normalizeName(project.name)))

/** First the project type, then the stack of that type (chosen automatically if there is only one). */
const chosenType = ref<ProjectType | null>(null)
/** Only the shipped templates are offered: nothing “en attente de développement” on screen. */
const availableTemplates = computed(() => props.templates.filter((template) => template.available))
const templatesOfType = computed(() => availableTemplates.value.filter((template) => template.type === chosenType.value))
/** Types that have at least one shipped template, grouped by family (empty families omitted). */
const familiesWithTypes = computed(() =>
  props.families
    .map((family) => ({
      ...family,
      types: props.types.filter(
        (type) => type.family === family.id && availableTemplates.value.some((template) => template.type === type.id),
      ),
    }))
    .filter((family) => family.types.length > 0),
)
watch(chosenType, () => {
  project.template = templatesOfType.value.length === 1 ? templatesOfType.value[0]!.id : ''
})

const chosenTemplate = computed(() => props.templates.find((template) => template.id === project.template) ?? null)
watch(chosenTemplate, (template) => {
  if (!template?.deployable) project.deployed = false
})

/** Advice of the assistant: it reads the idea, then ADA preselects the proposed type and stack. */
const advice = ref<StackAdvice | null>(null)
const adviceInProgress = ref(false)
const adviceError = ref<string | null>(null)
const isIdeaSufficient = computed(() => (project.idea ?? '').trim().length >= 10)
const advisedTemplate = computed(() => props.templates.find((template) => template.id === advice.value?.template) ?? null)
async function askAdvice(): Promise<void> {
  if (!props.adviser || !isIdeaSufficient.value) return
  adviceInProgress.value = true
  adviceError.value = null
  advice.value = null
  try {
    const response = await props.adviser(project.idea ?? '')
    const template = props.templates.find((candidate) => candidate.id === response.template && candidate.available)
    if (!template) throw new Error('ADA n’a pas pu proposer de stack : choisissez-la vous-même dans la liste.')
    advice.value = response
    chosenType.value = template.type
    await nextTick()
    project.template = template.id
  } catch (e) {
    adviceError.value = (e as Error).message
  } finally {
    adviceInProgress.value = false
  }
}

/**
 * Stepper (#68): first the idea (the assistant can guide the stack), then the type and the stack,
 * finally the name and the presentation. Each step is checked before moving to the next.
 */
const STEPS = ['Votre idée', 'Type de projet et stack', 'Nom et présentation'] as const
/** Visibility of the repository: private by default; public = code visible to all on GitHub. */
const visibilityOptions = [
  { label: 'Privé', value: 'private', hint: 'Seuls vous et les personnes que vous invitez voient le dépôt sur GitHub. Le choix par défaut.' },
  { label: 'Public', value: 'public', hint: 'Tout le monde peut voir le code sur GitHub. Jamais de donnée réelle ni de secret dans le projet.' },
]
const FIELDS_PER_STEP: (keyof NewProject)[][] = [['idea'], ['template'], ['name', 'objective', 'baseline']]
const step = ref(1)
const stepsArea = useTemplateRef<HTMLElement>('zone-etapes')

/** The focus goes to the step title: screen readers and keyboard users know where they are. */
async function goTo(number: number): Promise<void> {
  step.value = number
  await nextTick()
  const title = stepsArea.value?.querySelector<HTMLElement>('h2, h3')
  title?.setAttribute('tabindex', '-1')
  title?.focus()
}

/** Errors of the current step only (the other fields are not filled in yet). */
function isStepValid(number: number): boolean {
  const all = validateProjectForm(project)
  const fields = FIELDS_PER_STEP[number - 1]!
  localErrors.value = Object.fromEntries(Object.entries(all).filter(([field]) => fields.includes(field as keyof NewProject)))
  return Object.keys(localErrors.value).length === 0
}

/** The server refuses a field: back to the step that contains it. */
watch(
  () => props.serverErrors,
  (serverErrors) => {
    if (!serverErrors) return
    const number = FIELDS_PER_STEP.findIndex((fields) => fields.some((field) => serverErrors[field]))
    if (number >= 0) void goTo(number + 1)
  },
)

function previous(): void {
  localErrors.value = {}
  void goTo(step.value - 1)
}

function send(): void {
  if (!isStepValid(step.value)) return
  if (step.value < STEPS.length) {
    void goTo(step.value + 1)
    return
  }
  localErrors.value = validateProjectForm(project)
  if (Object.keys(localErrors.value).length > 0) return
  emit('submit', {
    ...project,
    name: normalizeName(project.name),
    baseline: normalizeName(project.baseline),
  })
}
</script>

<template>
  <form novalidate @submit.prevent="send">
    <h2 class="fr-h4">Nouveau projet</h2>
    <p class="fr-text--sm">
      Racontez votre idée : ADA crée le projet sur votre compte GitHub, et ADA s’en
      saisit aussitôt. L’objectif et la baseline sont facultatifs.
    </p>

    <div ref="zone-etapes">
      <DsfrStepper :steps="[...STEPS]" :current-step="step" />
    </div>

    <template v-if="step === 1">
      <DsfrInputGroup
        v-model="project.idea"
        label="Votre idée"
        hint="Racontez-la comme elle vient, même en vrac : le besoin, pour qui, ce qui vous gêne aujourd’hui… ADA vous posera ses questions, puis vous proposera les premières stories à valider."
        label-visible
        is-textarea
        rows="6"
        :error-message="errors.idea"
      />
      <div v-if="adviser" class="fr-mb-3w">
        <DsfrButton
          type="button"
          secondary
          size="sm"
          :label="adviceInProgress ? 'ADA réfléchit…' : 'Demander conseil à ADA pour la stack'"
          :disabled="adviceInProgress || !isIdeaSufficient"
          aria-describedby="advice-help"
          @click="askAdvice"
        />
        <p id="advice-help" class="fr-hint-text fr-mt-1v">
          ADA lit votre idée et présélectionne, à l’étape suivante, le type de projet et la
          stack les plus adaptés. Vous pourrez toujours choisir autre chose.
        </p>
        <div role="status">
          <DsfrAlert
            v-if="advice && advisedTemplate"
            type="info"
            small
            :description="`Conseil d’ADA : ${advisedTemplate.label}. ${advice.reason}`"
          />
        </div>
        <p v-if="adviceError" class="fr-error-text" role="alert">{{ adviceError }}</p>
      </div>
    </template>

    <template v-else-if="step === 2">
      <DsfrAlert
        v-if="advice && advisedTemplate"
        type="info"
        small
        class="fr-mb-3w"
        :description="`ADA conseille : ${advisedTemplate.label}. Ce choix est présélectionné ; vous pouvez choisir autre chose.`"
      />
      <fieldset class="fr-fieldset" :class="{ 'fr-fieldset--error': errors.template && !chosenType }">
        <legend class="fr-fieldset__legend">Que voulez-vous créer ?</legend>
        <div v-for="family in familiesWithTypes" :key="family.id" class="fr-fieldset__element">
          <fieldset class="fr-fieldset">
            <legend class="fr-fieldset__legend fr-fieldset__legend--regular fr-text--bold">
              {{ family.label }}
            </legend>
            <div v-for="type in family.types" :key="type.id" class="fr-fieldset__element">
              <div class="fr-radio-group">
                <input
                  :id="`type-${type.id}`"
                  v-model="chosenType"
                  type="radio"
                  name="project-type"
                  :value="type.id"
                />
                <label class="fr-label" :for="`type-${type.id}`">
                  {{ type.label }}
                  <span class="fr-hint-text">{{ type.description }}</span>
                </label>
              </div>
            </div>
          </fieldset>
        </div>
      </fieldset>

      <fieldset
        v-if="chosenType"
        class="fr-fieldset"
        :class="{ 'fr-fieldset--error': errors.template }"
        aria-describedby="stack-help"
      >
        <legend class="fr-fieldset__legend">Stack technique</legend>
        <p id="stack-help" class="fr-hint-text fr-fieldset__element">
          Celle indiquée par l’équipe technique pour ce type de projet.
        </p>
        <div v-for="template in templatesOfType" :key="template.id" class="fr-fieldset__element">
          <div class="fr-radio-group">
            <input
              :id="`template-${template.id}`"
              v-model="project.template"
              type="radio"
              name="template"
              :value="template.id"
            />
            <label class="fr-label" :for="`template-${template.id}`">
              {{ template.label }}<template v-if="template.id === advice?.template"> (conseillée par ADA)</template>
              <span class="fr-hint-text">{{ template.purpose }}</span>
            </label>
          </div>
        </div>
        <p v-if="errors.template" class="fr-error-text fr-fieldset__element" role="alert">
          {{ errors.template }}
        </p>
      </fieldset>
      <p v-else-if="errors.template" class="fr-error-text" role="alert">Choisissez ce que vous voulez créer</p>

      <div v-if="chosenTemplate?.deployable" class="fr-fieldset__element fr-mb-3w">
        <div class="fr-checkbox-group">
          <input id="deployed-project" v-model="project.deployed" type="checkbox" aria-describedby="deployed-project-help" />
          <label class="fr-label" for="deployed-project">
            Ce projet sera déployé (mis en ligne)
            <span id="deployed-project-help" class="fr-hint-text">
              ADA ajoute de quoi l’héberger : un chart Helm, vérifié à chaque demande. L’équipe
              infra fournit ensuite l’adresse et le registre. Modifiable plus tard par un développeur.
            </span>
          </label>
        </div>
      </div>
    </template>

    <template v-else>
      <DsfrInputGroup
        v-model="project.name"
        label="Nom du projet"
        :hint="address ? `Adresse du dépôt : ${address}` : 'Exemple : Réservation de salles'"
        label-visible
        :error-message="errors.name"
      />
      <DsfrInputGroup
        v-model="project.objective"
        label="Objectif en une phrase (facultatif)"
        hint="Si vous savez déjà le dire. Sinon, ADA reprend la première phrase de votre idée."
        label-visible
        is-textarea
        :error-message="errors.objective"
      />
      <DsfrInputGroup
        v-model="project.baseline"
        label="Baseline (facultatif)"
        hint="Phrase courte affichée sous le nom du service dans l’en-tête. Exemple : Ma journée avec POC Portail"
        label-visible
        :error-message="errors.baseline"
      />
      <DsfrRadioButtonSet
        v-model="project.visibility"
        name="visibility"
        legend="Visibilité du dépôt GitHub"
        :options="visibilityOptions"
        :error-message="errors.visibility"
      />
    </template>

    <p v-if="sendInProgress" class="fr-text--lg fr-mb-2w" role="status">
      Je fabrique votre projet{{ project.name.trim() ? ` « ${address || project.name.trim()} »` : '' }}…
    </p>

    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li v-if="step > 1">
        <DsfrButton type="button" secondary label="Étape précédente" @click="previous" />
      </li>
      <li>
        <DsfrButton
          type="submit"
          :label="step < STEPS.length ? 'Étape suivante' : sendInProgress ? 'Création en cours…' : 'Créer le projet'"
          :disabled="sendInProgress"
        />
      </li>
      <li>
        <DsfrButton type="button" tertiary label="Annuler" @click="emit('cancel')" />
      </li>
    </ul>
  </form>
</template>
