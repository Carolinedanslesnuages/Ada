<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import StoryFeed from '@/components/StoryFeed.vue'
import PromptForm from '@/components/PromptForm.vue'
import ProjectHome from '@/components/ProjectHome.vue'
import SideBar from '@/components/SideBar.vue'
import ProjectForm from '@/components/ProjectForm.vue'
import DeveloperAssignment from '@/components/DeveloperAssignment.vue'
import PreviewPanel from '@/components/PreviewPanel.vue'
import ProjectResult from '@/components/ProjectResult.vue'
import ProjectAdoption from '@/components/ProjectAdoption.vue'
import PendingAdoption from '@/components/PendingAdoption.vue'
import CancelAdoption from '@/components/CancelAdoption.vue'
import ProjectProtection from '@/components/ProjectProtection.vue'
import type { ProjectErrors, NewProject, CreationResult } from '@/lib/project'
import { ACTIVE_STATUSES, type ProposedStory } from '@/lib/story'
import { useProjetsStore } from '@/stores/projects'
import { useStoriesStore } from '@/stores/stories'

const projects = useProjetsStore()
const stories = useStoriesStore()

const sendInProgress = ref(false)
const launchInProgress = ref(false)

/** Project creation: form, then result screen with the GitHub settings. */
const projectCreation = ref(false)
const projectErrors = ref<ProjectErrors | null>(null)
const projectResult = ref<CreationResult | null>(null)
const projectError = ref<string | null>(null)

async function newProject(): Promise<void> {
  projectErrors.value = null
  projectError.value = null
  projectResult.value = null
  projectCreation.value = true
  try {
    await projects.loadTemplates()
  } catch (e) {
    projectError.value = (e as Error).message
  }
}

async function createProject(project: NewProject): Promise<void> {
  sendInProgress.value = true
  projectError.value = null
  try {
    const response = await projects.create(project)
    if ('errors' in response) projectErrors.value = response.errors
    else projectResult.value = response.result
  } catch (e) {
    projectError.value = (e as Error).message
  } finally {
    sendInProgress.value = false
  }
}

function closeProjectCreation(): void {
  projectCreation.value = false
  projectResult.value = null
}

/** Starting idea (#68): the project opens directly on it, where the assistant is already working. */
async function followIdea(number: number): Promise<void> {
  const id = projectResult.value?.project.id
  closeProjectCreation()
  if (!id) return
  projects.choose(id)
  await stories.load(id)
  await stories.open(id, number)
}

/** Adoption of an existing project (#37): ADA opens a PR that the PO approves on GitHub. */
const projectAdoption = ref(false)

async function adoptProject(): Promise<void> {
  projectError.value = null
  projectAdoption.value = true
  try {
    await projects.loadTemplates()
  } catch (e) {
    projectError.value = (e as Error).message
  }
}

function closeProjectAdoption(): void {
  projectAdoption.value = false
  void projects.load()
}

/** Analysis launched: the adopted project opens at once, the PO follows the assistant there. */
async function adoptionLaunched(id: string, analysis: number | null): Promise<void> {
  projectAdoption.value = false
  await projects.load()
  projects.choose(id)
  await stories.load(id)
  if (analysis) await stories.open(id, analysis)
}

async function mergedAdoption(): Promise<void> {
  await projects.load()
  if (projects.currentId) await stories.load(projects.currentId)
}

watch(
  () => projects.currentId,
  (name) => {
    if (name) void stories.load(name)
  },
)

/** Stories are written in GitHub: the list is read again when coming back to the workshop tab. */
function refresh(): void {
  if (projects.currentId && !projectCreation.value) void stories.load(projects.currentId, true)
}

onMounted(async () => {
  await projects.load()
  if (projects.currentId) await stories.load(projects.currentId)
  window.addEventListener('focus', refresh)
})

onUnmounted(() => window.removeEventListener('focus', refresh))

function chooseProject(name: string | number | null | undefined): void {
  if (typeof name === 'string' && name) projects.choose(name)
}

/** Adoption cancelled or project removed from ADA: it is no longer there, back to the list. */
async function adoptionCancelled(): Promise<void> {
  hideProject()
  await projects.load()
}

/** Hide the open project (e.g. before sharing the screen): it stays in the selector. */
function hideProject(): void {
  promptMode.value = false
  stories.close()
  projects.close()
}

async function open(number: number): Promise<void> {
  promptMode.value = false
  if (projects.currentId) await stories.open(projects.currentId, number)
}

async function launch(): Promise<void> {
  if (!projects.currentId || !stories.current) return
  launchInProgress.value = true
  try {
    await stories.launch(projects.currentId, stories.current.number)
  } finally {
    launchInProgress.value = false
  }
}

const otherInProgress = computed(() =>
  stories.active && stories.active.number !== stories.current?.number ? stories.active : null,
)

const actionInProgress = ref(false)

/** “New conversation”: back to the project home, the message area ready for writing. */
async function home(): Promise<void> {
  promptMode.value = false
  stories.close()
  await nextTick()
  document.getElementById('home-message')?.focus()
}

/**
 * Preview: the conversation keeps all the room; the application is viewed enlarged (or in a
 * tab), then back to the chat. It is prepared in the background to be ready when opened.
 */
const isPreviewEnlarged = ref(false)
const previewAddress = ref<string | null>(null)

async function showPreview(): Promise<void> {
  isPreviewEnlarged.value = true
  await nextTick()
  document.getElementById('preview-title')?.focus()
}

async function shrinkPreview(): Promise<void> {
  isPreviewEnlarged.value = false
  await nextTick()
  document.getElementById('show-preview')?.focus()
}

function globalKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isPreviewEnlarged.value) void shrinkPreview()
}
onMounted(() => window.addEventListener('keydown', globalKey))
onUnmounted(() => window.removeEventListener('keydown', globalKey))

/** Wild mode: “Prompter” form instead of the detail of a request. */
const promptMode = ref(false)
const promptError = ref<string | null>(null)

function openPrompt(): void {
  stories.close()
  promptError.value = null
  promptMode.value = true
}

/** Conversation (“real prompt”): the message written on the home opens it directly. */
const conversationError = ref<string | null>(null)

async function startConversation(text: string): Promise<void> {
  if (!projects.currentId) return
  actionInProgress.value = true
  conversationError.value = null
  try {
    conversationError.value = await stories.openConversation(projects.currentId, text)
  } finally {
    actionInProgress.value = false
  }
}

async function submitPrompt(text: string): Promise<void> {
  if (!projects.currentId) return
  actionInProgress.value = true
  try {
    promptError.value = await stories.submitPrompt(projects.currentId, text)
    if (!promptError.value) promptMode.value = false
  } finally {
    actionInProgress.value = false
  }
}

async function act(action: (project: string, number: number) => Promise<void>): Promise<void> {
  if (!projects.currentId || !stories.current) return
  actionInProgress.value = true
  try {
    await action(projects.currentId, stories.current.number)
  } finally {
    actionInProgress.value = false
  }
}

const validate = () => act((p, n) => stories.approvePlan(p, n))
const relaunch = () => act((p, n) => stories.relaunch(p, n))
const merge = () => act((p, n) => stories.merge(p, n))
const rerunChecks = () => act((p, n) => stories.rerunChecks(p, n))
const reply = (text: string) => act((p, n) => stories.reply(p, n, text))
const createBreakdown = (proposed: ProposedStory[]) => act((p, n) => stories.createBreakdown(p, n, proposed))
const sendMessage = (text: string) => act((p, n) => stories.sendMessage(p, n, text))
const finishConversation = () => act((p, n) => stories.finishConversation(p, n))
async function stopConversation(): Promise<void> {
  await act((p, n) => stories.stopConversation(p, n))
  if (!stories.actionError) stories.close()
}

/** Automatic polling while the open request is active or the assistant is working. */
let pollingTimer: ReturnType<typeof setInterval> | null = null
watch(
  () => [stories.current?.number, stories.current?.status, stories.activity?.inProgress] as const,
  ([number, status, isWorking]) => {
    if (pollingTimer) clearInterval(pollingTimer)
    pollingTimer = null
    const active = status !== undefined && ACTIVE_STATUSES.includes(status)
    if (number && (active || isWorking)) {
      if (projects.currentId && stories.activity === null) void stories.loadActivity(projects.currentId, number)
      if (projects.currentId && status === 'in-review') void stories.loadVerification(projects.currentId, number)
      pollingTimer = setInterval(() => {
        if (projects.currentId) void stories.poll(projects.currentId)
      }, 4000)
    }
  },
)
onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer)
})
</script>

<template>
  <h1 class="fr-sr-only">Atelier</h1>

  <DsfrAlert v-if="projects.error" type="error" title="Projets indisponibles" :description="projects.error" />

  <div v-else-if="projectCreation" class="fr-grid-row fr-grid-row--center">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <DsfrAlert v-if="projectError" type="error" small :description="projectError" class="fr-mb-3w" />
      <ProjectResult v-if="projectResult" :result="projectResult" @close="closeProjectCreation" @poll="followIdea" />
      <ProjectForm
        v-else
        :families="projects.families"
        :types="projects.types"
        :templates="projects.templates"
        :server-errors="projectErrors"
        :adviser="projects.adviseStack"
        :send-in-progress="sendInProgress"
        @submit="createProject"
        @cancel="closeProjectCreation"
      />
    </div>
  </div>

  <div v-else-if="projectAdoption" class="fr-grid-row fr-grid-row--center">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <DsfrAlert v-if="projectError" type="error" small :description="projectError" class="fr-mb-3w" />
      <ProjectAdoption :templates="projects.templates" @cancel="closeProjectAdoption" @launched="adoptionLaunched" />
    </div>
  </div>

  <div v-else-if="!projects.loading && projects.list.length === 0" class="fr-grid-row">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <DsfrAlert
        type="info"
        title="Aucun projet pour l’instant"
        description="Créez votre premier projet : il sera prêt sur GitHub en quelques secondes."
        class="fr-mb-3w"
      />
      <ul class="fr-btns-group fr-btns-group--inline-md">
        <li><DsfrButton icon="fr-icon-add-line" label="Nouveau projet" @click="newProject" /></li>
        <li><DsfrButton secondary icon="fr-icon-download-line" label="Reprendre un projet existant" @click="adoptProject" /></li>
      </ul>
    </div>
  </div>

  <div v-else class="workshop" :class="{ 'workshop--preview-enlarged': isPreviewEnlarged }">
    <SideBar
      class="workshop__column workshop__bar"
      @home="home"
      @choose="chooseProject"
      @open="open"
      @refresh="refresh"
      @new-project="newProject"
      @adopt-project="adoptProject"
      @hide-project="hideProject"
    />

    <section v-show="!isPreviewEnlarged" class="workshop__column workshop__center" aria-label="Demande en cours">
      <div v-if="projects.currentId && !projects.current?.adoption" class="workshop__top">
        <DsfrButton
          id="show-preview"
          tertiary
          no-outline
          size="sm"
          icon="fr-icon-fullscreen-line"
          label="Voir l’aperçu en grand"
          aria-controls="preview-panel"
          aria-expanded="false"
          @click="showPreview"
        />
        <a v-if="previewAddress" class="fr-link fr-link--sm" :href="previewAddress" target="_blank" rel="noopener">
          Ouvrir dans un onglet<span class="fr-sr-only"> (nouvelle fenêtre)</span>
        </a>
      </div>
      <ProjectProtection v-if="projects.currentId && !projects.current?.adoption" :project="projects.currentId" />

      <CancelAdoption v-if="projects.current" :key="projects.current.id" :project="projects.current" @done="adoptionCancelled" />
      <PendingAdoption v-if="projects.current?.adoption" :project="projects.current.id" @merged="mergedAdoption" />

      <p v-if="!projects.currentId" class="workshop__empty">Choisissez un projet dans la barre de gauche.</p>
      <template v-else>
        <PromptForm
          v-if="promptMode"
          :send-in-progress="actionInProgress"
          :server-error="promptError"
          @submit="submitPrompt"
          @cancel="promptMode = false"
        />
        <StoryFeed
          v-else-if="stories.current"
          :story="stories.current"
          :project="projects.currentId"
          :other-in-progress="otherInProgress"
          :launch-error="stories.launchError"
          :launch-in-progress="launchInProgress"
          :activity="stories.activity"
          :verification="stories.verification"
          :action-in-progress="actionInProgress"
          @launch="launch"
          @validate="validate"
          @relaunch="relaunch"
          @merge="merge"
          @rerun-checks="rerunChecks"
          @reply="reply"
          @create-breakdown="createBreakdown"
          @send-message="sendMessage"
          @finish-conversation="finishConversation"
          @stop-conversation="stopConversation"
          @open="open"
        />
        <ProjectHome
          v-else-if="projects.current && !projects.current.adoption"
          :project-name="projects.current.name"
          :project="projects.current.id"
          :stories="stories.todo"
          :active="stories.active"
          :send-in-progress="actionInProgress"
          :server-error="conversationError"
          @conversation="startConversation"
          @open="open"
          @guided="openPrompt"
        />
        <DeveloperAssignment
          v-if="!promptMode && stories.current && projects.currentId"
          :project="projects.currentId"
          :story="stories.current"
        />
        <DsfrAlert v-if="stories.actionError" type="error" small :description="stories.actionError" />
      </template>
    </section>

    <PreviewPanel
      v-show="isPreviewEnlarged"
      id="preview-panel"
      class="workshop__column workshop__preview"
      collapsible
      @collapse="shrinkPreview"
      @address="(url) => (previewAddress = url)"
      :project="projects.currentId"
      :pending="projects.current?.adoption ? 'L’aperçu démarrera une fois la reprise validée : ADA saura alors comment lancer le projet.' : null"
    />
  </div>
</template>
