/** ADA's indicators: pure functions, computed from what GitHub knows about the requests. */
import type { ProjectsSummary } from './registry.js';

/** A request (story, bug or free mode), as GitHub allows measuring it. */
export interface MeasuredWorkRequest {
  delivered: boolean;
  /** Closing of the issue (delivery). */
  closedAt: string | null;
  /** First move to the “in progress” status (launch from ADA), if known. */
  launchedAt: string | null;
}

export interface Measurements {
  deliveredStories: number;
  /** Average time from launch to delivery, in minutes; null when nothing can be measured. */
  averageDurationMinutes: number | null;
}

export interface ProjectIndicators extends Measurements {
  name: string;
}

export interface Indicators extends Measurements {
  projects: number;
  /** Every project that went through ADA, including those archived, removed or deleted since. */
  history: ProjectsSummary;
  byProject: ProjectIndicators[];
}

const minutesBetween = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / 60000;

function measure(workRequests: MeasuredWorkRequest[]): Measurements {
  const delivered = workRequests.filter((workRequest) => workRequest.delivered);
  const durations = delivered
    .filter((workRequest) => workRequest.launchedAt && workRequest.closedAt)
    .map((workRequest) => minutesBetween(workRequest.launchedAt!, workRequest.closedAt!))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  return {
    deliveredStories: delivered.length,
    averageDurationMinutes: durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : null,
  };
}

export function computeIndicators(projects: { name: string; workRequests: MeasuredWorkRequest[] }[], history: ProjectsSummary): Indicators {
  return {
    projects: projects.length,
    history,
    ...measure(projects.flatMap((project) => project.workRequests)),
    byProject: projects
      .map((project) => ({ name: project.name, ...measure(project.workRequests) }))
      .sort((first, second) => second.deliveredStories - first.deliveredStories || first.name.localeCompare(second.name)),
  };
}

/** Launch of the request from ADA, according to the label events of the issue. */
export function readHistory(
  events: { event?: string; created_at?: string; label?: { name?: string } | null }[],
  inProgressLabel: string,
): { launchedAt: string | null } {
  const applied = events.filter((event) => event.event === 'labeled');
  const launch = applied
    .filter((event) => event.label?.name === inProgressLabel && event.created_at)
    .map((event) => event.created_at!)
    .sort()[0];
  return { launchedAt: launch ?? null };
}
