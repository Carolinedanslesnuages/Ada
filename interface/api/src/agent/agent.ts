/**
 * What the coding agent receives and returns: the request, its decisions, the name of its branch.
 * Instructions: instructions.ts; allowed tools: tools.ts; reading the answers: responses.ts;
 * activity translated for the PO: activity.ts.
 */
import type { BugContent, StoryContent, ProposedStory, WorkRequestType } from '../stories/story.js';

/** “adoption”: analysis of an existing project adopted by ADA (#37), read-only. */
export type Phase = 'analysis' | 'implementation' | 'adoption' | 'conversation';

export interface WorkRequest {
  number: number;
  title: string;
  type: WorkRequestType;
  content: StoryContent | null;
  bugContent: BugContent | null;
  /** Wild mode: the PO's prompt. */
  freeContent: string | null;
  /** Exchanges since the launch (questions, plan, answers from the PO), in order. */
  exchanges: { author: 'assistant' | 'po'; text: string }[];
  /** Analysis: the other stories of the project, so as never to propose one a second time. */
  existingStories?: ExistingStory[];
  /** Broken-down request this one comes from: it ends when its stories are delivered. */
  parent?: number | null;
}

/** What must be done, described by data: can be handed to a worker process. */
export interface Task {
  phase: Phase;
  token: string;
  login: string;
  repository: string;
  number: number;
  /** “adoption” phase: stack given by the PO (optional) and chosen appearance. */
  adoption?: { template: string | null; dsfr: boolean };
  /** Conversation: the PO said “all good” (full checks, then PR). */
  finalize?: boolean;
}

/** A story or a bug already written in the project (open, or delivered). */
export interface ExistingStory {
  number: number;
  title: string;
  delivered: boolean;
  /** Broken-down request it comes from, if any. */
  parent?: number | null;
  /** True: broken-down request, which delivers nothing itself (it waits for its stories). */
  brokenDown?: boolean;
}

/** A question settled between a few options: the PO answers by ticking (#35). */
export interface ChoiceQuestion {
  question: string;
  choice: string[];
  /** True: several answers possible (checkboxes); false: only one (radio buttons). */
  several: boolean;
}

export type AnalysisDecision = {
  decision: 'questions' | 'plan' | 'breakdown' | 'waiting';
  text: string;
  choice?: ChoiceQuestion[];
  /** Breakdown: the proposed stories (the PO chooses which ones ADA creates, #36). */
  stories?: ProposedStory[];
};

/** Marks, in the GitHub comment, the structured choices read by ADA (invisible on GitHub). */
export const CHOICE_MARKER = 'ada:choix';
export type ImplementationResult = { result: 'ok'; summary: string } | { result: 'blocked'; reason: string };

export function branchOf(workRequest: Pick<WorkRequest, 'number' | 'title' | 'type'>): string {
  const slug = workRequest.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  const prefix = { bug: 'fix', free: 'free', story: 'story', conversation: 'conversation' }[workRequest.type];
  return `${prefix}/${workRequest.number}-${slug.replace(/^(demande-libre|conversation)-/, '') || 'demande'}`;
}
