import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ApiError } from '@/services/api'
import type { ProjectErrors, ProjectFamily, Template, NewProject, CreationResult, ProjectTypeOption, StackAdvice } from '@/lib/project'

export interface Project {
  /** Identifier in ADA: the name, or “account~name” for a project of the PO's personal account. */
  id: string
  name: string
  owner: string
  account: 'organization' | 'personal'
  /** Adoption not approved yet (#37): analysis in progress, or adoption PR to merge. */
  adoption: { pullRequest: string | null } | null
  /** Adopted project (not created by ADA): it can be unlinked, without deleting anything. */
  adopted: boolean
  description: string | null
  isPrivate: boolean
  url: string
  updatedAt: string | null
}

/** Existing repository the PO can have ADA adopt (#37). */
export interface RepositoryToAdopt {
  id: string
  name: string
  owner: string
  account: 'organization' | 'personal'
  description: string | null
  url: string
  /** Adoption PR already open, waiting to be merged. */
  adoptionInProgress: string | null
  /** The assistant analyses the project; the adoption PR will open at the end. */
  analysisInProgress: boolean
}

export interface AdoptionResult {
  /** Identifier of the project: it appears in ADA as soon as the analysis is launched. */
  id: string
  /** Analysis request, on GitHub: summary and improvements proposed by the assistant. */
  analysis: string | null
  pullRequest: string | null
}

export const useProjetsStore = defineStore('projects', () => {
  const list = ref<Project[]>([])
  const currentId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const templates = ref<Template[]>([])
  const types = ref<ProjectTypeOption[]>([])
  const families = ref<ProjectFamily[]>([])

  const current = computed(() => list.value.find((p) => p.id === currentId.value) ?? null)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      list.value = await api.read<Project[]>('/projects')
      // No project open on arrival: the PO chooses (nothing is displayed without their choice).
      if (currentId.value && !current.value) currentId.value = null
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function loadTemplates(): Promise<void> {
    if (templates.value.length > 0) return
    const catalog = await api.read<{ families: ProjectFamily[]; types: ProjectTypeOption[]; templates: Template[] }>(
      '/projects/templates',
    )
    families.value = catalog.families
    types.value = catalog.types
    templates.value = catalog.templates
  }

  /** Creates the project, adds it at the top and selects it; returns the validation errors, if any. */
  /** The assistant reads the PO's idea and proposes the best-suited stack (#68). */
  function adviseStack(idea: string): Promise<StackAdvice> {
    return api.send<StackAdvice>('/projects/stack-advice', { idea })
  }

  async function create(
    project: NewProject,
  ): Promise<{ result: CreationResult } | { errors: ProjectErrors }> {
    try {
      const result = await api.send<CreationResult>('/projects', project)
      list.value = [result.project, ...list.value.filter((p) => p.id !== result.project.id)]
      currentId.value = result.project.id
      return { result }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 409) && e.errors) {
        return { errors: e.errors as ProjectErrors }
      }
      throw e
    }
  }

  function choose(id: string): void {
    currentId.value = id
  }

  /** Hides the open project: it stays in the list, nothing is displayed until the next choice. */
  function close(): void {
    currentId.value = null
  }

  function toAdopt(): Promise<RepositoryToAdopt[]> {
    return api.read<RepositoryToAdopt[]>('/projects/to-adopt')
  }

  /**
   * The assistant analyses the project, then ADA opens the adoption PR; the project appears in the
   * list once it is merged. The stack is optional.
   */
  function adopt(repository: string, template: string | null, dsfr: boolean): Promise<AdoptionResult> {
    return api.send<AdoptionResult>('/projects/adopt', { repository, template, dsfr })
  }

  return {
    list,
    templates,
    types,
    families,
    currentId,
    current,
    loading,
    error,
    load,
    loadTemplates,
    create,
    adviseStack,
    choose,
    close,
    toAdopt,
    adopt,
  }
})

// Hot update in development: without this, an open tab keeps the old version of the store.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useProjetsStore, import.meta.hot))
