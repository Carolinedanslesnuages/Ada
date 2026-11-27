/** What ADA shows of a request (summary, detail) and how it reads it in a GitHub issue. */
import { unknownAuthorReason } from './trust.js';
import type { FrozenWorkRequest } from './work-requests.js';
import { readBug, readConversation, readParent, readPrompt, readStory, typeFrom, checkReady, type BugContent, type StoryContent, type Status, type WorkRequestType } from './story.js';

export interface StorySummary {
  number: number;
  type: WorkRequestType;
  title: string;
  status: Status;
  createdAt: string;
  /** Closing date of the issue (delivery), null as long as it is open. */
  closedAt: string | null;
  url: string;
  /** Ready to be launched (complete, small enough); otherwise the reason, to fix on GitHub. */
  ready: boolean;
  reason: string | null;
  /** Broken-down request the story comes from (breakdown order); null otherwise. */
  parent: number | null;
  /** Written by someone with write access to the project (see trust.ts). */
  reliable: boolean;
}

export interface Message {
  id: number;
  author: string;
  avatar: string | null;
  text: string;
  at: string;
}

/** Developer who can be assigned to a request (access to the project repository). */
export interface Person {
  login: string;
  avatar: string | null;
}

export interface StoryDetail extends StorySummary {
  /** Developers assigned on GitHub (unblocking a “Needs a developer” request). */
  assignees: Person[];
  content: StoryContent | null;
  bugContent: BugContent | null;
  /** Wild mode: the PO's prompt. */
  freeContent: string | null;
  rawText: string;
  messages: Message[];
  /** Fingerprint of the displayed title and body: sent back at launch to check that nothing changed. */
  fingerprint: string;
  /** Comments written directly on GitHub since the launch, which ADA does not read (the PO must answer in ADA). */
  ignoredComments: number;
}
export type Issue = {
  number: number;
  title: string;
  state: string;
  created_at: string;
  closed_at?: string | null;
  /** “not_planned”: closed without being implemented (duplicate, abandoned) — it is not a delivery. */
  state_reason?: string | null;
  html_url: string;
  body?: string | null;
  pull_request?: unknown;
  labels: (string | { name?: string })[];
  /** Link of the author with the repository (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, NONE…). */
  author_association?: string | null;
  user?: { login?: string | null } | null;
};

export const labelNames = (labels: Issue['labels']) => labels.map((l) => (typeof l === 'string' ? l : (l.name ?? '')));

/** `trusted`: the author has write access to the project (see trust.ts); otherwise the request is not launched. */
export const summarize = (i: Issue, trusted: boolean, status: Status): StorySummary => {
  const labels = labelNames(i.labels);
  const body = i.body ?? '';
  const type = typeFrom(labels, body) ?? 'story';
  const verification = checkReady(type, readStory(body), readBug(body), readPrompt(body) ?? readConversation(body));
  return {
    number: i.number,
    type,
    title: i.title,
    status,
    createdAt: i.created_at,
    closedAt: i.closed_at ?? null,
    url: i.html_url,
    ready: verification.ready && trusted,
    reason: !trusted ? unknownAuthorReason(i.user?.login) : verification.ready ? null : verification.reason,
    parent: readParent(body),
    reliable: trusted,
  };
};

/** The request as it is in the issue, frozen at launch: the agent will never read the live issue. */
export function frozenFromIssue(issue: Issue, type: WorkRequestType, login: string): FrozenWorkRequest {
  const body = issue.body ?? '';
  return {
    number: issue.number,
    title: issue.title,
    type,
    content: readStory(body),
    bugContent: readBug(body),
    freeContent: readPrompt(body) ?? readConversation(body),
    parent: readParent(body),
    launchedAt: new Date().toISOString(),
    launchedBy: login,
  };
}
