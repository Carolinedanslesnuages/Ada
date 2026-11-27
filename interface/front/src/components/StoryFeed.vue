<script setup lang="ts">
import AdaAvatar from '@/components/AdaAvatar.vue'
import DictateButton from '@/components/DictateButton.vue'
import WorkRequestContent from '@/components/WorkRequestContent.vue'
import AdaConversation from '@/components/AdaConversation.vue'
import { api } from '@/services/api'
import { asStreaming, formatCo2, type Footprint } from '@/lib/footprint'
import BreakdownProposal from '@/components/BreakdownProposal.vue'
import ChoiceAnswer from '@/components/ChoiceAnswer.vue'
import RichText from '@/components/RichText.vue'
import ChecksVerification from '@/components/ChecksVerification.vue'
import { computed, ref, watch } from 'vue'
import {
  toLaunchOrRelaunch,
  STATUS_LABELS,
  presentMessage,
  readChoices,
  readBreakdown,
  readParentStories,
  type ProposedStory,
  ASSISTANT_MARKER,
  type Activity,
  type StoryDetail,
  type Verification,
} from '@/lib/story'

const props = defineProps<{
  story: StoryDetail
  /** Number and title of the request in progress on the project, if there is another one. */
  otherInProgress?: { number: number; title: string } | null
  activity?: Activity | null
  verification?: Verification | null
  launchError?: string | null
  launchInProgress?: boolean
  actionInProgress?: boolean
  /** Project of the request: to read its estimated carbon footprint. */
  project?: string | null
}>()
const emit = defineEmits<{
  launch: []
  validate: []
  relaunch: []
  merge: []
  rerunChecks: []
  reply: [text: string]
  createBreakdown: [stories: ProposedStory[]]
  sendMessage: [text: string]
  finishConversation: []
  stopConversation: []
  open: [number: number]
}>()

/** Why the request cannot be launched, or null if it can. */
const blocker = computed(() => {
  if (!toLaunchOrRelaunch(props.story)) return null
  if (!props.story.ready) return `À corriger sur GitHub avant de la lancer : ${props.story.reason}.`
  if (props.otherInProgress)
    return `La demande #${props.otherInProgress.number} « ${props.otherInProgress.title} » est en cours : une seule à la fois.`
  return null
})

const messages = computed(() => props.story.messages.map((m) => ({ id: m.id, at: m.at, ...presentMessage(m) })))

/** Comments written directly on GitHub: ADA does not read them, the PO must answer here. */
const ignoredCommentsNotice = computed(() => {
  const count = props.story.ignoredComments ?? 0
  if (!count) return null
  return count === 1
    ? 'Un commentaire a été écrit directement sur GitHub. ADA ne le lit pas : si vous voulez qu’elle en tienne compte, recopiez-le ici.'
    : `${count} commentaires ont été écrits directement sur GitHub. ADA ne les lit pas : si vous voulez qu’elle en tienne compte, recopiez-les ici.`
})
const isWorking = computed(() => props.activity?.inProgress === true)

/** Estimated carbon footprint of the request: read when opened, and when ADA has finished some work. */
const footprint = ref<{ footprint: Footprint; equivalents: { streamingHourGrams: number } } | null>(null)
async function readFootprint(): Promise<void> {
  if (!props.project) return
  try {
    footprint.value = await api.read(`/projects/${encodeURIComponent(props.project)}/stories/${props.story.number}/footprint`)
  } catch {
    footprint.value = null
  }
}
watch(
  () => [props.project, props.story.number, isWorking.value] as const,
  ([, , atWork]) => {
    if (!atWork) void readFootprint()
  },
  { immediate: true },
)
/** Conversation in progress (before “all good”): the whole feed is displayed, like a discussion. */
const inConversation = computed(
  () => props.story.type === 'conversation' && ['in-progress', 'exchange', 'needs-developer'].includes(props.story.status),
)
const lastActions = computed(() => (props.activity?.log ?? []).slice(-8).reverse())

/** Text field: answer to the questions, or change requested on the plan. */
const editMode = ref(false)
const openFolds = ref(-1)
const text = ref('')
const error = ref('')
/** Last message of the assistant (shown in full under the action); the rest is the history, collapsed. */
const lastMessage = computed(() => [...messages.value].reverse().find((message) => message.assistant) ?? null)
const history = computed(() => messages.value.filter((message) => message.id !== lastMessage.value?.id))
/** An action is expected from the PO (otherwise no “À vous de jouer” banner). */
const expectedAction = computed(
  () =>
    ['new', 'waiting', 'in-review', 'plan-to-approve', 'questions', 'breakdown', 'needs-developer'].includes(props.story.status) ||
    (props.story.status === 'in-progress' && Boolean(props.activity)),
)

/** Choices attached by the assistant to its last questions: answer with checkboxes (#35). */
const choiceQuestions = computed(() => {
  if (props.story.status !== 'questions') return []
  const last = [...props.story.messages].reverse().find((message) => message.text.startsWith(ASSISTANT_MARKER))
  return last ? readChoices(last.text) : []
})

const visibleField = computed(
  () =>
    !isWorking.value &&
    (props.story.status === 'questions' ||
      ((props.story.status === 'plan-to-approve' || props.story.status === 'breakdown') && editMode.value)),
)

/** Breakdown proposed by the assistant (#36): stories to tick. */
const breakdownProposal = computed(() => {
  if (props.story.status !== 'breakdown') return []
  const last = [...props.story.messages].reverse().find((message) => message.text.startsWith(ASSISTANT_MARKER))
  return last ? readBreakdown(last.text) : []
})
/** Broken-down request: its stories, ticked once delivered. */
const parentStories = computed(() => readParentStories(props.story.rawText ?? ''))

/** “de la story n° 12”, “du signalement n° 4”…: where the answer is saved on GitHub. */
const designation = computed(() => {
  const nature = { bug: 'du signalement', free: 'de la demande', conversation: 'de la conversation', story: 'de la story' }[props.story.type]
  return `${nature} n° ${props.story.number}`
})

const hour = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/** Dictation: each recognized sentence is appended to the text. */
function addDictation(phrase: string): void {
  text.value = text.value.trim() ? `${text.value.trimEnd()} ${phrase}` : phrase
}

function send(): void {
  if (!text.value.trim()) {
    error.value = props.story.status === 'questions' ? 'Écrivez vos réponses avant d’envoyer' : 'Dites ce qu’il faut changer dans le plan'
    return
  }
  error.value = ''
  emit('reply', text.value.trim())
  text.value = ''
  editMode.value = false
}
</script>

<template>
  <article>
    <h2 class="fr-h4 fr-mb-1w">#{{ story.number }} — {{ story.title }}</h2>
    <p class="fr-mb-2w">
      <DsfrBadge
        :label="STATUS_LABELS[story.status].label"
        :type="STATUS_LABELS[story.status].type"
        small
      />
      <a class="fr-link fr-link--sm fr-ml-2w" :href="story.url" target="_blank" rel="noopener">
        Voir sur GitHub<span class="fr-sr-only"> (nouvelle fenêtre)</span>
      </a>
    </p>
    <DsfrAlert v-if="ignoredCommentsNotice" type="info" small class="fr-mb-2w" :description="ignoredCommentsNotice" />

    <!-- 1. The assistant's last message, in full, first: it explains what is expected from the PO. -->
    <AdaConversation
      v-if="inConversation"
      :story="story"
      :awaits-answer="story.status === 'exchange' && !isWorking"
      :action-in-progress="actionInProgress"
      @send="(message) => emit('sendMessage', message)"
      @finish="emit('finishConversation')"
      @stop="emit('stopConversation')"
      @create-stories="(stories) => emit('createBreakdown', stories)"
    />
    <section v-else-if="lastMessage" class="fr-mb-3w" aria-labelledby="last-message-title">
      <h3 id="last-message-title" class="fr-h6 fr-mb-1w">Dernier message d’ADA</h3>
      <div class="feed__assistant last-message">
        <p class="fr-text--xs fr-mb-1v"><strong>{{ lastMessage.author }}</strong> — {{ date(lastMessage.at) }}</p>
        <RichText :text="lastMessage.text" />
      </div>
    </section>

    <!-- 2. What is expected from the PO, right after the explanation: nothing to look for, nothing to scroll. -->
    <section v-if="isWorking" class="fr-callout fr-mb-3w activity" aria-labelledby="action-title">
      <h3 id="action-title" class="fr-callout__title fr-h6">ADA travaille</h3>
      <div role="status" aria-live="polite">
        <p class="fr-mb-1w">
          <span class="fr-icon-refresh-line fr-icon--sm activity__icon" aria-hidden="true" />
          <strong>
            ADA {{ activity?.phase === 'implementation' ? 'réalise la demande' : activity?.phase === 'conversation' ? 'travaille sur votre message' : 'analyse la demande' }}…
          </strong>
          <span v-if="activity?.phase === 'conversation'" class="fr-text--sm">
            L’aperçu montrera ses changements dès qu’elle aura répondu.
          </span>
          <span v-else-if="activity?.phase === 'implementation'" class="fr-text--sm">
            L’aperçu montre son travail en cours : ce n’est pas encore terminé. Vous serez prévenu
            ici quand ce sera prêt à vérifier.
          </span>
        </p>
        <ol v-if="lastActions.length" class="activity__log fr-text--sm">
          <li v-for="action in lastActions" :key="action.at + action.text">
            <span class="fr-text--xs">{{ hour(action.at) }}</span> {{ action.text }}
          </li>
        </ol>
      </div>
    </section>

    <section v-else-if="expectedAction" class="fr-callout fr-mb-3w your-turn" aria-labelledby="action-title">
      <h3 id="action-title" class="fr-callout__title fr-h6">
        {{ story.status === 'in-review' ? 'À vous de vérifier' : 'À vous de jouer' }}
      </h3>

      <template v-if="toLaunchOrRelaunch(story)">
        <p v-if="story.status === 'waiting'" class="fr-text--sm">
          ADA a mis cette demande en attente : rien à construire pour l’instant. Relancez-la quand ce qu’elle attend sera livré.
        </p>
        <DsfrAlert v-if="blocker" type="warning" small :description="blocker" />
        <template v-else>
          <DsfrButton
            icon="fr-icon-play-line"
            :label="launchInProgress ? 'Lancement…' : story.type === 'bug' ? 'Lancer la correction' : story.status === 'waiting' ? 'Relancer cette story' : 'Lancer cette story'"
            aria-describedby="launch-saving"
            :disabled="launchInProgress"
            @click="emit('launch')"
          />
          <p id="launch-saving" class="fr-text--sm fr-mt-1w fr-mb-0">
            <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
            Le lancement est noté sur GitHub, à votre nom : un commentaire et le statut {{ designation }}.
          </p>
        </template>
        <DsfrAlert v-if="launchError" type="error" small :description="launchError" class="fr-mt-2w" />
      </template>

      <template v-else-if="story.status === 'in-review'">
        <ChecksVerification
          :verification="verification"
          :action-in-progress="actionInProgress"
          @merge="emit('merge')"
          @rerun-checks="emit('rerunChecks')"
        />
      </template>

      <template v-else-if="story.status === 'in-progress' || story.status === 'needs-developer'">
        <p class="fr-text--sm fr-mb-1w">
          {{ story.status === 'needs-developer' ? 'ADA est bloquée sur cette demande.' : 'ADA ne travaille pas sur cette demande en ce moment.' }}
        </p>
        <DsfrAlert v-if="activity?.error" type="error" small :description="activity.error" class="fr-mb-2w" />
        <DsfrButton size="sm" secondary icon="fr-icon-refresh-line" label="Relancer ADA" :disabled="actionInProgress" @click="emit('relaunch')" />
      </template>

      <div v-else-if="story.status === 'plan-to-approve' && !editMode">
        <p class="fr-text--sm fr-mb-2w">ADA attend votre accord sur le plan ci-dessus avant de commencer.</p>
        <p id="approval-saving" class="fr-text--sm fr-mb-2w">
          <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
          Votre accord est enregistré sur GitHub, en commentaire {{ designation }}, à votre nom.
        </p>
        <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
          <li>
            <DsfrButton icon="fr-icon-check-line" label="Valider le plan" aria-describedby="approval-saving" :disabled="actionInProgress" @click="emit('validate')" />
          </li>
          <li>
            <DsfrButton secondary label="Demander une modification" :disabled="actionInProgress" @click="editMode = true" />
          </li>
        </ul>
      </div>

      <BreakdownProposal
        v-if="breakdownProposal.length && !editMode"
        :key="`decoupage-${story.messages.length}`"
        :stories="breakdownProposal"
        :designation="`la demande n° ${story.number}`"
        :action-in-progress="actionInProgress"
        @create="(stories) => emit('createBreakdown', stories)"
        @other-breakdown="editMode = true"
      />
      <ChoiceAnswer
        v-if="visibleField && choiceQuestions.length"
        :key="story.messages.length"
        :questions="choiceQuestions"
        :action-in-progress="actionInProgress"
        send-description="choice-answer-saving"
        @reply="(response) => emit('reply', response)"
      >
        <template #before-send>
          <p id="choice-answer-saving" class="fr-text--sm fr-mb-2w">
            <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
            <strong>En envoyant, vos réponses sont enregistrées sur GitHub, en commentaire
            {{ designation }}</strong>, à votre nom et visible par l’équipe du projet.
          </p>
        </template>
      </ChoiceAnswer>
      <form v-else-if="visibleField" novalidate class="fr-mt-2w" @submit.prevent="send">
        <p v-if="story.status === 'questions'" class="fr-text--sm fr-mb-2w">
          ADA attend vos réponses à ses questions ci-dessous pour continuer.
        </p>
        <DsfrInputGroup
          id="ada-answer"
          v-model="text"
          :label="story.status === 'questions' ? 'Vos réponses' : story.status === 'breakdown' ? 'Ce qu’il faut changer dans le découpage' : 'Ce qu’il faut changer dans le plan'"
          label-visible
          is-textarea
          :error-message="error"
        />
        <DictateButton field="ada-answer" class="fr-mb-2w" @text="addDictation" />
        <p id="answer-saving" class="fr-text--sm fr-mb-2w">
          <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
          <strong>En envoyant, votre texte est enregistré tel quel sur GitHub, en commentaire
          {{ designation }}</strong>, à votre nom et visible par l’équipe du projet. Il garde la trace
          des échanges avec ADA.
        </p>
        <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
          <li><DsfrButton type="submit" label="Envoyer" aria-describedby="answer-saving" :disabled="actionInProgress" /></li>
          <li v-if="editMode">
            <DsfrButton type="button" tertiary label="Annuler" @click="editMode = false" />
          </li>
        </ul>
      </form>
    </section>

    <!-- 3. The request itself. -->    <WorkRequestContent :story="story" />

    <section v-if="parentStories.length" class="fr-mb-3w" aria-labelledby="parent-title">
      <h3 id="parent-title" class="fr-h6 fr-mb-1w">Découpée en {{ parentStories.length }} stories</h3>
      <ul class="fr-p-0 parent-stories">
        <li v-for="child in parentStories" :key="child.number" class="fr-mb-1w">
          <DsfrButton
            size="sm"
            tertiary
            :label="`#${child.number} ${child.title} — ${child.delivered ? 'livrée' : 'à faire'}`"
            :icon="child.delivered ? 'fr-icon-checkbox-circle-line' : 'fr-icon-time-line'"
            @click="emit('open', child.number)"
          />
        </li>
      </ul>
    </section>

    <!-- 4. The past, collapsed: log, pull request, exchanges in order. -->
    <section v-if="story.status !== 'new'" aria-labelledby="tracking-title">
      <h3 id="tracking-title" class="fr-h6">Suivi</h3>
      <ol v-if="!isWorking && lastActions.length" class="activity__log fr-text--sm">
        <li v-for="action in lastActions" :key="action.at + action.text">
          <span class="fr-text--xs">{{ hour(action.at) }}</span> {{ action.text }}
        </li>
      </ol>
      <p v-if="footprint" class="fr-text--xs fr-mt-1w" data-testid="request-footprint">
        <span class="fr-icon-leaf-line fr-icon--sm" aria-hidden="true" />
        Empreinte estimée de cette demande : {{ formatCo2(footprint.footprint.co2Grams) }}, soit
        {{ asStreaming(footprint.footprint.co2Grams, footprint.equivalents.streamingHourGrams) }}.
        <RouterLink to="/indicators">Comment c’est calculé</RouterLink>
      </p>
      <p v-if="activity?.pullRequest" class="fr-mt-1w">
        <a class="fr-link" :href="activity.pullRequest" target="_blank" rel="noopener">
          Voir la demande de fusion (pull request) et ses contrôles<span class="fr-sr-only"> (nouvelle fenêtre)</span>
        </a>
      </p>
      <DsfrAccordionsGroup v-model="openFolds" class="fr-mb-2w">
        <DsfrAccordion v-if="history.length && story.type !== 'conversation'" id="history" :title="`Voir l’historique (${history.length} échange${history.length > 1 ? 's' : ''})`">
          <ol class="feed">
            <li v-for="message in history" :key="message.id" :class="{ 'feed__assistant': message.assistant }">
              <p class="fr-text--xs fr-mb-1v">
                <strong>{{ message.author }}</strong> — {{ date(message.at) }}
              </p>
              <RichText :text="message.text" />
            </li>
          </ol>
        </DsfrAccordion>
        <DsfrAccordion id="why-github" title="Pourquoi les échanges sont-ils enregistrés sur GitHub ?">
          <p class="fr-text--sm fr-mb-1w">
            Vos réponses, votre accord sur le plan et les questions d’ADA sont recopiés en
            commentaires {{ designation }}. C’est un choix volontaire :
          </p>
          <ul class="fr-text--sm">
            <li><strong>Traçabilité</strong> : on sait qui a demandé quoi et qui a validé quel plan, quand. Important quand du code est écrit par une IA.</li>
            <li><strong>Un développeur peut reprendre</strong> en cas de blocage : tout le contexte est au même endroit.</li>
            <li><strong>L’historique appartient au projet</strong>, pas à ADA : il reste si l’outil change.</li>
          </ul>
          <p class="fr-text--sm fr-mb-0">
            N’y écrivez donc rien de confidentiel. ADA garde sa propre trace des échanges : ce qui est
            écrit ou modifié directement sur GitHub ne lui parvient pas. Pour lui répondre, écrivez ici.
          </p>
        </DsfrAccordion>
      </DsfrAccordionsGroup>
    </section>
    <!-- Attached to the page, not to the column: the column that scrolls on its own no longer hides it under the preview. -->
    <Teleport to="body">
      <AdaAvatar v-if="isWorking" :phase="activity?.phase" />
    </Teleport>
  </article>
</template>

<style scoped>
.parent-stories {
  list-style: none;
}
</style>
