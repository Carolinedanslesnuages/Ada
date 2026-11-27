/** Rules shared with the API (api/src/projects/project.ts). */
/** Identifier of a project type (list provided by the API: api/src/projects/templates.ts). */
export type ProjectType = string

export interface ProjectFamily {
  id: string
  label: string
}

export interface ProjectTypeOption {
  id: ProjectType
  family: string
  label: string
  description: string
}

export interface Template {
  id: string
  type: ProjectType
  label: string
  purpose: string
  /** Template shipped in ADA's catalog: this type of project can be created. */
  available: boolean
  /** The template can be deployed (Docker image and Helm chart). */
  deployable: boolean
}

/** Advice of the assistant: the template best suited to the idea, and why, in one sentence (#68). */
export interface StackAdvice {
  template: string
  reason: string
}

/** Idea told freely at creation (even brief or disjointed) (#68). */
export const MAX_IDEA_LENGTH = 4000

export interface NewProject {
  name: string
  /** Optional if an idea is told: ADA then deduces it from its first sentence. */
  objective: string
  /** The PO's idea, as it comes: first request of the project, studied by the assistant. */
  idea?: string
  template: string
  /** Optional: short sentence under the service name in the DSFR header. */
  baseline: string
  /** The project will be deployed: ADA adds the template's Helm chart. */
  deployed: boolean
  /** GitHub repository private (by default) or public, visible to all. */
  visibility?: 'private' | 'public'
}

export type ProjectErrors = Partial<Record<keyof NewProject, string>>

export interface Setting {
  state: 'done' | 'to-do'
  link: string
}

export interface CreationResult {
  project: { id: string; name: string; owner: string; account: 'organization' | 'personal'; adoption: { pullRequest: string | null } | null; adopted: boolean; description: string | null; isPrivate: boolean; url: string; updatedAt: string | null }
  settings: { automaticVersions: Setting; mainProtection: Setting }
  /** Number of the request created from the idea; null without an idea (or if it could not be saved). */
  idea?: number | null
}

export function normalizeName(name: string): string {
  return name.replace(/'/g, '’').replace(/\s+/g, ' ').trim()
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

export function validateProjectForm(project: NewProject): ProjectErrors {
  const errors: ProjectErrors = {}
  const name = normalizeName(project.name)
  if (name.length < 3 || slugify(name).length < 3) errors.name = 'Le nom doit faire au moins 3 caractères'
  else if (!/^[\p{L}\p{N}][\p{L}\p{N} ’-]*$/u.test(name))
    errors.name = 'Lettres, chiffres, espaces, tirets et apostrophes uniquement'
  else if (name.length > 60) errors.name = '60 caractères au maximum'
  const idea = (project.idea ?? '').trim()
  const objective = project.objective.replace(/\s+/g, ' ').trim()
  if (!idea && !objective) errors.idea = 'Racontez votre idée, même en quelques mots'
  else if (idea && idea.length < 10) errors.idea = 'Quelques mots de plus : une phrase au moins'
  else if (idea.length > MAX_IDEA_LENGTH) errors.idea = `${MAX_IDEA_LENGTH} caractères au maximum`
  if (objective && objective.length < 10) errors.objective = 'Décrivez l’objectif en une ou deux phrases'
  else if (objective.length > 300) errors.objective = '300 caractères au maximum'
  if (!project.template) errors.template = 'Choisissez une stack'
  const baseline = normalizeName(project.baseline)
  if (baseline.length > 80) errors.baseline = '80 caractères au maximum'
  else if (!/^[\p{L}\p{N} ’.,!?:;()«»-]*$/u.test(baseline))
    errors.baseline = 'Lettres, chiffres, espaces et ponctuation simple uniquement'
  return errors
}
