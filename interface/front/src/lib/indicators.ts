/** ADA's indicators (api/src/indicators/indicators.ts) and their formatting. */
export interface Measurements {
  deliveredStories: number
  averageDurationMinutes: number | null
}

/** Every project that went through ADA, including those archived, removed or deleted since. */
export interface ProjectsSummary {
  total: number
  created: number
  adopted: number
  active: number
  archives: number
  removed: number
  deleted: number
}

export interface Indicators extends Measurements {
  projects: number
  history: ProjectsSummary
  byProject: (Measurements & { name: string })[]
}

const NO_MEASURE = 'Pas encore mesurable'

/** “25 min”, “1 h 05”, “2 j 3 h”. */
export function duration(minutes: number | null): string {
  if (minutes === null) return NO_MEASURE
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${String(Math.round(minutes % 60)).padStart(2, '0')}`
  return `${Math.floor(hours / 24)} j ${hours % 24} h`
}
