/** Stories and bugs: written by the PO in GitHub, read and launched from the workshop. */
export const MAX_CRITERIA = 4

export type Status =
  | 'new'
  | 'in-progress'
  | 'questions'
  | 'plan-to-approve'
  | 'in-review'
  | 'needs-developer'
  | 'breakdown'
  | 'parent'
  | 'waiting'
  | 'exchange'
  | 'delivered'

export const ACTIVE_STATUSES: Status[] = [
  'in-progress',
  'questions',
  'plan-to-approve',
  'in-review',
  'needs-developer',
  'breakdown',
  'exchange',
]

export const STATUS_LABELS: Record<
  Status,
  { label: string; type: 'info' | 'new' | 'warning' | 'success' | 'error' }
> = {
  new: { label: 'À lancer', type: 'new' },
  'in-progress': { label: 'En cours', type: 'info' },
  questions: { label: 'Questions', type: 'warning' },
  'plan-to-approve': { label: 'Plan à valider', type: 'warning' },
  'in-review': { label: 'À vérifier', type: 'info' },
  'needs-developer': { label: 'Besoin d’un développeur', type: 'error' },
  breakdown: { label: 'Découpage à valider', type: 'warning' },
  parent: { label: 'Découpée', type: 'info' },
  waiting: { label: 'En attente', type: 'info' },
  exchange: { label: 'À vous', type: 'warning' },
  delivered: { label: 'Livrée', type: 'success' },
}

export type WorkRequestType = 'story' | 'bug' | 'free' | 'conversation'

/** Conversation (“real prompt”): the size of a message, from “yes” to a long specification. */
export const MAX_MESSAGE_LENGTH = 8000
/** Launch comment, set by ADA: not a message of the conversation. */
export const LAUNCH_MARKER = '▶️ Lancée depuis ADA'

export interface StorySummary {
  number: number
  type: WorkRequestType
  title: string
  status: Status
  createdAt: string
  /** Delivery date (closed issue), null otherwise. */
  closedAt: string | null
  url: string
  ready: boolean
  reason: string | null
  /** Broken-down request the story comes from (breakdown order); null otherwise. */
  parent?: number | null
}

/**
 * Advised order of the requests to launch: first the ready ones; among them, the
 * reported bugs (they get in the way of use); then the stories of a same breakdown stay
 * together, in the order proposed by ADA (dependencies); the rest, from oldest to most recent.
 * Requests on hold (nothing to build for now) always come last.
 */
/** Request that can be launched: never launched, or put on hold by ADA (relaunch). */
export const toLaunchOrRelaunch = (story: Pick<StorySummary, 'status'>) => story.status === 'new' || story.status === 'waiting'

export function orderToLaunch(stories: StorySummary[]): StorySummary[] {
  const origin = (story: StorySummary) => story.parent ?? story.number
  return [...stories].sort(
    (a, b) =>
      Number(a.status === 'waiting') - Number(b.status === 'waiting') ||
      Number(b.ready) - Number(a.ready) ||
      Number(b.type === 'bug') - Number(a.type === 'bug') ||
      origin(a) - origin(b) ||
      a.number - b.number,
  )
}

export interface StoryContent {
  role: string
  need: string
  benefit: string
  criteria: string[]
}

export interface BugContent {
  observed: string
  expected: string
  steps: string
  screen: string
}

export interface Message {
  id: number
  author: string
  avatar: string | null
  text: string
  at: string
}

/** Developer who can be assigned (access to the project repository). */
export interface Person {
  login: string
  avatar: string | null
}

export interface StoryDetail extends StorySummary {
  /** Developers assigned on GitHub. */
  assignees: Person[]
  content: StoryContent | null
  bugContent: BugContent | null
  freeContent: string | null
  rawText: string
  messages: Message[]
  /** Fingerprint of the displayed content: sent back at launch (ADA refuses if the issue changed in the meantime). */
  fingerprint?: string
  /** Comments written directly on GitHub since the launch: ADA does not read them. */
  ignoredComments?: number
}

/** Address of the GitHub form to write a story or report a bug. */
export function newIssueLink(repositoryUrl: string, template: 'user-story.yml' | 'bug.yml'): string {
  return `${repositoryUrl}/issues/new?template=${template}`
}

/** What the assistant does on a request (log the PO can read). */
export interface Activity {
  phase: 'analysis' | 'implementation' | 'adoption' | 'conversation' | null
  inProgress: boolean
  start: string | null
  log: { at: string; text: string }[]
  error: string | null
  pullRequest: string | null
}

export const ASSISTANT_MARKER = '<!-- atelier-po:assistant -->'

/** Question settled between a few options (api/src/agent/agent.ts, #35). */
export interface ChoiceQuestion {
  question: string
  choice: string[]
  several: boolean
}

const CHOICE_DATA = /<!-- ada:choix (\S+) -->/
const READABLE_CHOICE_BLOCK = /\n*\*\*Choix proposés\*\* \(à cocher dans ADA\) :[\s\S]*$/

/** Structured choices attached by the assistant to its questions; [] if there are none (or unreadable). */
export function readChoices(text: string): ChoiceQuestion[] {
  const data = CHOICE_DATA.exec(text)?.[1]
  if (!data) return []
  try {
    const choice = JSON.parse(decodeBase64(data)) as ChoiceQuestion[]
    return Array.isArray(choice) ? choice.filter((question) => question.question && question.choice?.length >= 2) : []
  } catch {
    return []
  }
}

/** Answer sent to the assistant (and saved on GitHub): readable, one question per paragraph. */
export function composeAnswer(questions: ChoiceQuestion[], answers: { ticked: string[]; precision: string }[]): string {
  return questions
    .map((question, rank) => {
      const response = answers[rank] ?? { ticked: [], precision: '' }
      const lines = [`${rank + 1}. ${question.question}`]
      if (response.ticked.length) lines.push(`→ ${response.ticked.join(' ; ')}`)
      if (response.precision.trim()) lines.push(`Précision : ${response.precision.trim()}`)
      return lines.join('\n')
    })
    .join('\n\n')
}

/** Story proposed by the assistant when a request is too big (#36). */
export interface ProposedStory {
  title: string
  role: string
  need: string
  benefit: string
  criteria: string[]
  /** Story already in the project that this one overlaps (reported by ADA): unticked by default. */
  duplicateOf?: number
}

const BREAKDOWN_DATA = /<!-- ada:decoupage (\S+) -->/
const READABLE_BREAKDOWN_BLOCK = /\n*\*\*Stories proposées\*\* \(à choisir dans ADA\) :[\s\S]*$/

const decodeBase64 = (data: string) => new TextDecoder().decode(Uint8Array.from(atob(data), (character) => character.charCodeAt(0)))

export function readBreakdown(text: string): ProposedStory[] {
  const data = BREAKDOWN_DATA.exec(text)?.[1]
  if (!data) return []
  try {
    const stories = JSON.parse(decodeBase64(data)) as ProposedStory[]
    return Array.isArray(stories) ? stories.filter((story) => story.title && story.criteria?.length) : []
  } catch {
    return []
  }
}

/** Stories of a broken-down request, read in its checklist (“Découpage” section). */
export function readParentStories(body: string): { number: number; title: string; delivered: boolean }[] {
  const section = body.split('### Découpage')[1] ?? ''
  return [...section.matchAll(/^- \[( |x)\] #(\d+) (.*)$/gm)].map((line) => ({
    number: Number(line[2]),
    title: line[3]!.trim(),
    delivered: line[1] === 'x',
  }))
}

/** Message displayed to the PO: the assistant's messages are signed “Assistant”, without a marker. */
export function presentMessage(message: Message): { author: string; text: string; assistant: boolean } {
  const assistant = message.text.startsWith(ASSISTANT_MARKER)
  return {
    author: assistant ? 'ADA' : message.author,
    // The choices are presented in the answer form: they are not repeated in the feed.
    text: assistant
      ? message.text
          .replace(ASSISTANT_MARKER, '')
          .replace(CHOICE_DATA, '')
          .replace(READABLE_CHOICE_BLOCK, '')
          .replace(BREAKDOWN_DATA, '')
          .replace(READABLE_BREAKDOWN_BLOCK, '')
          // Answer in conversation: the “🤖 ADA” title repeats the author, already displayed.
          .replace(/^\s*🤖 \*\*ADA\*\*\s*/, '')
          .trim()
      : message.text,
    assistant,
  }
}

export interface Check {
  name: string
  /** “not-launched”: GitHub refused to run the check (account billing), the code is not at fault. */
  state: 'pending' | 'in-progress' | 'succeeded' | 'failed' | 'not-launched'
  link: string | null
}

/** Review of an implemented request: PR, CI checks, merge possible or not. */
export interface Verification {
  pullRequest: { number: number; url: string; state: 'open' | 'merged' | 'closed' } | null
  checks: Check[]
  mergeable: boolean
  reason: string | null
}

export const CHECK_LABELS: Record<Check['state'], string> = {
  'pending': 'en attente',
  'in-progress': 'en cours',
  succeeded: 'réussi',
  failed: 'échoué',
  'not-launched': 'non lancé par GitHub',
}

export const MIN_PROMPT_LENGTH = 10
export const MAX_PROMPT_LENGTH = 1000
