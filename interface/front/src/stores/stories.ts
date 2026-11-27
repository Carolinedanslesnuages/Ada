import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ApiError } from '@/services/api'
import {
  ACTIVE_STATUSES,
  type Activity,
  type StoryDetail,
  type Person,
  type ProposedStory,
  type StorySummary,
  type Verification,
} from '@/lib/story'

export const useStoriesStore = defineStore('stories', () => {
  const list = ref<StorySummary[]>([])
  const current = ref<StoryDetail | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const launchError = ref<string | null>(null)
  const activity = ref<Activity | null>(null)
  const verification = ref<Verification | null>(null)
  const actionError = ref<string | null>(null)
  /** Assignable developers of the current project (read on demand). */
  const developers = ref<Person[] | null>(null)

  /** The request that keeps the project busy: as long as it exists, no other is launched. */
  /** Main list: what is left to do or is in progress. */
  const todo = computed(() => list.value.filter((story) => story.status !== 'delivered'))
  /** Delivered stories, from most recent to oldest. */
  const delivered = computed(() =>
    list.value
      .filter((story) => story.status === 'delivered')
      .sort((first, second) => (second.closedAt ?? '').localeCompare(first.closedAt ?? '')),
  )
  const active = computed(() => list.value.find((s) => ACTIVE_STATUSES.includes(s.status)) ?? null)

  const filePath = (project: string) => `/projects/${encodeURIComponent(project)}/stories`

  async function load(project: string, keepCurrent = false): Promise<void> {
    loading.value = !keepCurrent
    error.value = null
    if (!keepCurrent) {
      current.value = null
      developers.value = null // other project: other assignable people
    }
    try {
      list.value = await api.read<StorySummary[]>(filePath(project))
    } catch (e) {
      if (!keepCurrent) list.value = []
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function open(project: string, number: number): Promise<void> {
    error.value = null
    launchError.value = null
    if (current.value?.number !== number) {
      activity.value = null
      verification.value = null
    }
    try {
      current.value = await api.read<StoryDetail>(`${filePath(project)}/${number}`)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function launch(project: string, number: number): Promise<void> {
    launchError.value = null
    try {
      // What the PO has in front of them: ADA refuses to launch without this fingerprint, or if the issue was modified on GitHub since.
      if (current.value?.number !== number) await open(project, number)
      const fingerprint = current.value?.fingerprint
      await api.send<StorySummary>(`${filePath(project)}/${number}/launch`, { fingerprint })
      await load(project, true)
      await open(project, number)
      await loadActivity(project, number)
    } catch (e) {
      const message = (e as Error).message
      // Request modified in the meantime (or other conflict): the current version is shown, to review before relaunching.
      if (e instanceof ApiError && e.status === 409) await open(project, number)
      launchError.value = message
    }
  }

  async function loadActivity(project: string, number: number): Promise<void> {
    try {
      activity.value = await api.read<Activity>(`${filePath(project)}/${number}/activity`)
    } catch {
      /* activity unavailable: the previous one is kept */
    }
  }

  async function loadVerification(project: string, number: number): Promise<void> {
    try {
      verification.value = await api.read<Verification>(`${filePath(project)}/${number}/verification`)
    } catch {
      /* unavailable: the previous one is kept */
    }
  }

  /** Reruns the checks GitHub had not launched (billing fixed in the meantime). */
  async function rerunChecks(project: string, number: number): Promise<void> {
    actionError.value = null
    try {
      verification.value = await api.send<Verification>(`${filePath(project)}/${number}/checks/relaunch`, {})
    } catch (e) {
      actionError.value = (e as Error).message
    }
  }

  /** Merges the request (green checks): it becomes delivered, the next one can be launched. */
  async function merge(project: string, number: number): Promise<void> {
    actionError.value = null
    try {
      verification.value = await api.send<Verification>(`${filePath(project)}/${number}/merge`, {})
      await load(project, true)
      // Delivered: it joins “Déjà livrées” and its detail closes.
      if (list.value.find((story) => story.number === number)?.status === 'delivered') {
        close()
        return
      }
      await open(project, number)
      await loadActivity(project, number)
    } catch (e) {
      actionError.value = (e as Error).message
    }
  }

  /** Reads again the open request, its activity and the list (statuses changed by the assistant). */
  async function poll(project: string): Promise<void> {
    const number = current.value?.number
    if (!number) return
    await Promise.all([loadActivity(project, number), load(project, true)])
    if (current.value?.status === 'in-review') await loadVerification(project, number)
    const summary = list.value.find((s) => s.number === number)
    if (summary && summary.status !== current.value?.status) await open(project, number)
    else if (current.value?.number === number) {
      current.value = await api.read<StoryDetail>(`${filePath(project)}/${number}`).catch(() => current.value)
    }
  }

  async function act(project: string, number: number, action: () => Promise<unknown>): Promise<void> {
    actionError.value = null
    try {
      await action()
      await open(project, number)
      await loadActivity(project, number)
      await load(project, true)
    } catch (e) {
      actionError.value = (e as Error).message
    }
  }

  const approvePlan = (project: string, number: number) =>
    act(project, number, () => api.send(`${filePath(project)}/${number}/plan/approve`, {}))

  /** Wild mode: saves the prompt (issue), launches it and opens it; returns the error, if any. */
  async function submitPrompt(project: string, text: string): Promise<string | null> {
    try {
      const workRequest = await api.send<StorySummary>(`${filePath(project)}/prompt`, { text })
      await load(project, true)
      await open(project, workRequest.number)
      await loadActivity(project, workRequest.number)
      return null
    } catch (e) {
      return (e as Error).message
    }
  }

  /** Conversation (“real prompt”): the first message opens the issue, ADA answers by acting. */
  async function openConversation(project: string, text: string): Promise<string | null> {
    try {
      const conversation = await api.send<StorySummary>(`${filePath(project)}/conversation`, { text })
      await load(project, true)
      await open(project, conversation.number)
      await loadActivity(project, conversation.number)
      return null
    } catch (e) {
      return (e as Error).message
    }
  }
  const sendMessage = (project: string, number: number, text: string) =>
    act(project, number, () => api.send(`${filePath(project)}/${number}/conversation/message`, { text }))
  /** “All good”: ADA proposes the changes to the project (PR), or closes if there are none. */
  const finishConversation = (project: string, number: number) =>
    act(project, number, () => api.send(`${filePath(project)}/${number}/conversation/finish`, {}))
  const stopConversation = (project: string, number: number) =>
    act(project, number, () => api.send(`${filePath(project)}/${number}/conversation/stop`, {}))

  const relaunch = (project: string, number: number) =>
    act(project, number, () => api.send(`${filePath(project)}/${number}/relaunch`, {}))

  /** Approved breakdown: ADA publishes the stories reviewed by the PO; the request becomes their parent (#36). */
  const createBreakdown = (project: string, number: number, stories: ProposedStory[]) =>
    act(project, number, () => api.send(`${filePath(project)}/${number}/breakdown`, { stories }))

  /** Answer to the questions, or change requested on the plan. */
  const reply = (project: string, number: number, text: string) =>
    act(project, number, () => api.send(`${filePath(project)}/${number}/response`, { text }))

  function close(): void {
    current.value = null
    activity.value = null
    verification.value = null
  }

  async function loadDevelopers(project: string): Promise<void> {
    actionError.value = null
    try {
      developers.value = await api.read<Person[]>(`${filePath(project)}/developers`)
    } catch (e) {
      actionError.value = (e as Error).message
    }
  }

  /** Assigns a developer to the open request (null: removes the assignment). */
  async function assign(project: string, number: number, login: string | null): Promise<void> {
    actionError.value = null
    try {
      current.value = await api.send<StoryDetail>(`${filePath(project)}/${number}/assign`, { login })
    } catch (e) {
      actionError.value = (e as Error).message
    }
  }

  return {
    createBreakdown,
    developers,
    loadDevelopers,
    assign,
    list,
    todo,
    delivered,
    current,
    active,
    loading,
    error,
    launchError,
    activity,
    verification,
    actionError,
    loadVerification,
    merge,
    rerunChecks,
    load,
    loadActivity,
    poll,
    approvePlan,
    relaunch,
    submitPrompt,
    openConversation,
    sendMessage,
    finishConversation,
    stopConversation,
    open,
    launch,
    reply,
    close,
  }
})

// Hot update in development: without this, an open tab keeps the old version of the store.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useStoriesStore, import.meta.hot))
