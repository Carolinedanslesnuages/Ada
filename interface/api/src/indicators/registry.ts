/** Registry of ADA's projects: pure rules (the file is managed by RegistryService). */

export type Origin = 'created' | 'adopted' | 'unknown';
export type ProjectState = 'active' | 'archived' | 'removed' | 'deleted';

export interface RegistryEntry {
  /** ADA identifier of the project (“name” or “account~name”). */
  id: string;
  owner: string;
  repo: string;
  origin: Origin;
  /** Date of entry into ADA (creation, adoption, or first known trace). */
  at: string;
  by: string | null;
}

export interface ProjectsSummary {
  total: number;
  created: number;
  adopted: number;
  active: number;
  archives: number;
  /** Still on GitHub but no longer in ADA (adoption cancelled, unlinked). */
  removed: number;
  /** Gone from GitHub. */
  deleted: number;
}

/** Adds an entry if the project is not there yet (the registry only grows). */
export function save(registry: RegistryEntry[], entry: RegistryEntry): RegistryEntry[] {
  const existing = registry.find((line) => line.id === entry.id);
  if (!existing) return [...registry, entry];
  // An “unknown” trace (preview) is completed as soon as the origin is known.
  if (existing.origin === 'unknown' && entry.origin !== 'unknown') {
    return registry.map((line) => (line.id === entry.id ? { ...line, origin: entry.origin, by: entry.by ?? line.by } : line));
  }
  return registry;
}

/**
 * State of a registry project, according to GitHub: null = not found (deleted, or no longer accessible).
 */
export function projectState(repository: { archived?: boolean; topics?: string[] } | null, workshopTopic: string): ProjectState {
  if (!repository) return 'deleted';
  if (repository.archived) return 'archived';
  return (repository.topics ?? []).includes(workshopTopic) || (repository.topics ?? []).includes('atelier-po') ? 'active' : 'removed';
}

export function summary(projects: { origin: Origin; state: ProjectState }[]): ProjectsSummary {
  const count = (criterion: (project: { origin: Origin; state: ProjectState }) => boolean) => projects.filter(criterion).length;
  return {
    total: projects.length,
    created: count((project) => project.origin !== 'adopted'),
    adopted: count((project) => project.origin === 'adopted'),
    active: count((project) => project.state === 'active'),
    archives: count((project) => project.state === 'archived'),
    removed: count((project) => project.state === 'removed'),
    deleted: count((project) => project.state === 'deleted'),
  };
}
