import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Stories and bugs are written by the PO in GitHub (issue forms
 * user-story.yml and bug.yml of the projects). The workshop reads them, checks that they are ready,
 * and launches them one by one.
 */
export const MAX_CRITERIA = 4;
export const STORY_LABEL = 'user-story';
export const BUG_LABEL = 'bug';
/** Free request (“wild mode”): a prompt from the PO, outside a story, saved as an issue. */
export const FREE_LABEL = 'mode-libre';
const FREE_MARKER = '<!-- ada:mode-libre -->';
/**
 * Conversation (“real prompt”): the PO speaks freely to ADA, which acts right away on a
 * separate branch; nothing reaches the project before the PO says “all good” (PR).
 */
export const CONVERSATION_LABEL = 'mode-conversation';
const CONVERSATION_MARKER = '<!-- ada:conversation -->';
const CONVERSATION_SECTION = 'conversation avec ada';
export const CONVERSATION_PREFIX = 'Conversation : ';
/** A conversation message: from “yes” to a long specification. */
export const MAX_MESSAGE_LENGTH = 8000;
/** Comment that marks the launch of a request by ADA. */
export const LAUNCH_MARKER = '▶️ Lancée depuis ADA';

export const MIN_PROMPT_LENGTH = 10;
export const MAX_PROMPT_LENGTH = 1000;

export const STATUSES = {
  'in-progress': 'story:en-cours',
  questions: 'story:questions',
  'plan-to-approve': 'story:plan-a-valider',
  'in-review': 'story:en-verification',
  'needs-developer': 'story:besoin-dev',
  /** The assistant proposed a breakdown: the PO chooses the stories to create (#36). */
  breakdown: 'story:decoupage-a-valider',
  /** Broken-down request: its stories are implemented one by one; it closes when all are delivered. */
  parent: 'story:parent',
  /** Nothing to build for now (it waits for another story): kept open, to relaunch later. */
  waiting: 'story:en-attente',
  /** Conversation: ADA answered, it is the PO's turn to write (or to say “all good”). */
  exchange: 'story:conversation',
} as const;

export type Status = 'new' | keyof typeof STATUSES | 'delivered';
export type WorkRequestType = 'story' | 'bug' | 'free' | 'conversation';

/** Statuses that keep the project busy: while a request has one, no other is launched. */
export const ACTIVE_STATUSES: Status[] = ['in-progress', 'questions', 'plan-to-approve', 'in-review', 'needs-developer', 'breakdown', 'exchange'];

export interface StoryContent {
  role: string;
  need: string;
  benefit: string;
  criteria: string[];
}

export interface BugContent {
  observed: string;
  expected: string;
  steps: string;
  screen: string;
}

/** “### Title” sections of an issue created with a GitHub form. */
function formSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  for (const piece of body.split(/^### /m).slice(1)) {
    const [title, ...rest] = piece.split('\n');
    const value = rest.join('\n').trim();
    sections.set((title ?? '').trim().toLowerCase(), value === '_No response_' ? '' : value);
  }
  return sections;
}

const criteriaList = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/^\s*(- \[[ x]\]|[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

export function readStory(body: string): StoryContent | null {
  const f = formSections(body);
  if (!f.has('en tant que')) return null;
  const criterion = [...f.keys()].find((k) => k.startsWith('critères') || k.startsWith('criteres'));
  return {
    role: f.get('en tant que') ?? '',
    need: f.get('je veux') ?? '',
    benefit: f.get('afin de') ?? '',
    criteria: criterion ? criteriaList(f.get(criterion) ?? '') : [],
  };
}

/** Body of the issue created for a prompt: readable on GitHub, readable back by ADA. */
export function formatPrompt(text: string): string {
  return ['### Demande libre (mode sauvage, hors story)', '', text.trim(), '', FREE_MARKER].join('\n');
}

/** Body of the issue of a conversation: the PO's first message. */
export function formatConversation(text: string): string {
  return ['### Conversation avec ADA', '', text.trim(), '', CONVERSATION_MARKER].join('\n');
}

export function readConversation(body: string): string | null {
  if (!body.includes(CONVERSATION_MARKER)) return null;
  return formSections(body).get(CONVERSATION_SECTION)?.replace(CONVERSATION_MARKER, '').trim() ?? null;
}

export function conversationTitle(text: string): string {
  return `${CONVERSATION_PREFIX}${summarizePrompt(text)}`;
}

/** Conversation message: the first one says what it is about (one sentence); the following ones, even “yes”. */
export function checkMessage(text: unknown, first: boolean): { ok: true; text: string } | { ok: false; error: string } {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (first && clean.length < MIN_PROMPT_LENGTH) return { ok: false, error: 'Dites à ADA ce que vous voulez faire, en une phrase au moins' };
  if (!clean) return { ok: false, error: 'Écrivez votre message à ADA' };
  if (clean.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `${MAX_MESSAGE_LENGTH} caractères au maximum par message : envoyez la suite dans un autre message` };
  return { ok: true, text: clean };
}

export function readPrompt(body: string): string | null {
  if (!body.includes(FREE_MARKER)) return null;
  return formSections(body).get('demande libre (mode sauvage, hors story)')?.replace(FREE_MARKER, '').trim() ?? null;
}

/** Title of the issue: the beginning of the prompt, cut cleanly. */
export const FREE_PREFIX = 'Demande libre : ';
const MAX_FREE_TITLE_LENGTH = 72;

/**
 * Short title of a prompt: its first clause (up to the first “.”, “!”, “?”, “;”
 * or “:”), cut between two words if it is still too long. It becomes the title of the issue then,
 * without the prefix, that of the PR and the line of the release notes.
 */
export function summarizePrompt(text: string, max = MAX_FREE_TITLE_LENGTH): string {
  const line = text.trim().split('\n')[0]!.replace(/\s+/g, ' ');
  const proposition = (line.split(/(?<=[.!?;])\s|\s:\s|\s?:\s/)[0] ?? line).replace(/[.;:]$/, '').trim() || line;
  if (proposition.length <= max) return proposition;
  const cut = proposition.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function promptTitle(text: string): string {
  return `${FREE_PREFIX}${summarizePrompt(text)}`;
}

export function checkPrompt(text: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (clean.length < MIN_PROMPT_LENGTH) return { ok: false, error: 'Décrivez votre demande en une phrase au moins' };
  if (clean.length > MAX_PROMPT_LENGTH) {
    return { ok: false, error: `${MAX_PROMPT_LENGTH} caractères au maximum : pour une demande plus importante, écrivez des stories` };
  }
  return { ok: true, text: clean };
}

export function readBug(body: string): BugContent | null {
  const f = formSections(body);
  if (!f.has('ce qui se passe')) return null;
  return {
    observed: f.get('ce qui se passe') ?? '',
    expected: f.get('ce qui devrait se passer') ?? '',
    steps: f.get('comment le reproduire') ?? '',
    screen: f.get('écran ou adresse concerné') ?? '',
  };
}

const filled = (min: number, message: string) => z.string().trim().min(min, message);

const schemaStory = z.object({
  role: filled(3, 'Le champ « En tant que » est vide'),
  need: filled(5, 'Le champ « Je veux » est vide'),
  benefit: filled(5, 'Le champ « Afin de » est vide'),
  criteria: z
    .array(z.string())
    .min(1, 'Aucun critère d’acceptation')
    .max(MAX_CRITERIA, `Plus de ${MAX_CRITERIA} critères : découpez-la en plusieurs stories sur GitHub`),
});

const schemaBug = z.object({
  observed: filled(5, 'Le champ « Ce qui se passe » est vide'),
  expected: filled(5, 'Le champ « Ce qui devrait se passer » est vide'),
  steps: filled(5, 'Le champ « Comment le reproduire » est vide'),
});

/** A request is launched only if it is complete and small enough. */
export function checkReady(
  type: WorkRequestType,
  story: StoryContent | null,
  bug: BugContent | null,
  prompt: string | null = null,
): { ready: true } | { ready: false; reason: string } {
  if (type === 'conversation') return { ready: true };
  if (type === 'free') {
    const r = checkPrompt(prompt);
    return r.ok ? { ready: true } : { ready: false, reason: r.error };
  }
  if (type === 'story') {
    if (!story) return { ready: false, reason: 'Story écrite hors du formulaire « User story » de GitHub' };
    const r = schemaStory.safeParse(story);
    return r.success ? { ready: true } : { ready: false, reason: r.error.issues[0]!.message };
  }
  if (!bug) return { ready: false, reason: 'Problème écrit hors du formulaire « Signaler un problème » de GitHub' };
  const r = schemaBug.safeParse(bug);
  return r.success ? { ready: true } : { ready: false, reason: r.error.issues[0]!.message };
}

export function statusFrom(state: 'open' | 'closed', labels: string[]): Status {
  if (state === 'closed') return 'delivered';
  const found = (Object.keys(STATUSES) as (keyof typeof STATUSES)[]).find((s) => labels.includes(STATUSES[s]));
  return found ?? 'new';
}

/**
 * Story or bug? First the label; otherwise the content of the form (the GitHub form
 * only sets its label if it already exists in the repository). null: neither.
 */
export function typeFrom(labels: string[], body = ''): WorkRequestType | null {
  if (labels.includes(CONVERSATION_LABEL) || body.includes(CONVERSATION_MARKER)) return 'conversation';
  if (labels.includes(FREE_LABEL) || body.includes(FREE_MARKER)) return 'free';
  if (labels.includes(BUG_LABEL)) return 'bug';
  if (labels.includes(STORY_LABEL)) return 'story';
  if (readStory(body)) return 'story';
  if (readBug(body)) return 'bug';
  return null;
}

/* ---------- Breakdown of a request into stories (#36) ---------- */

/** Story proposed by the assistant when a request is too big. */
export interface ProposedStory {
  title: string;
  role: string;
  need: string;
  benefit: string;
  criteria: string[];
  /** Story already in the project that this one overlaps: ADA reports it, the PO does not publish it by mistake. */
  duplicateOf?: number;
}

export const BREAKDOWN_MARKER = 'ada:decoupage';
const BREAKDOWN_DATA = /<!-- ada:decoupage (\S+) -->/;
const PARENT_SECTION = '### Demande parent';
const BREAKDOWN_SECTION = '### Découpage';
/** Story proposed in conversation: where it comes from, without making it a child of the conversation. */
const ORIGIN_SECTION = '### Origine';

const shortText = (value: unknown, maximum: number) => (typeof value === 'string' ? value.trim().slice(0, maximum) : '');

/**
 * Keeps only complete stories: from `minimum` to 8, each with 1 to MAX_CRITERIA criteria. A
 * breakdown proposes at least two; in conversation, a single story for later is enough.
 */
export function cleanProposedStories(raw: unknown, minimum = 2): ProposedStory[] {
  if (!Array.isArray(raw)) return [];
  const stories = raw
    .map((element) => (element ?? {}) as Record<string, unknown>)
    .map((element) => ({
      title: shortText(element.title, 120),
      role: shortText(element.role, 200),
      need: shortText(element.need, 600),
      benefit: shortText(element.benefit, 600),
      criteria: (Array.isArray(element.criteria) ? element.criteria : [])
        .map((criterion) => shortText(criterion, 300))
        .filter(Boolean)
        .slice(0, MAX_CRITERIA),
      ...(Number.isInteger(element.duplicateOf) && (element.duplicateOf as number) > 0 ? { duplicateOf: element.duplicateOf as number } : {}),
    }))
    .filter((story) => story.title && story.role && story.need && story.benefit && story.criteria.length > 0)
    .slice(0, 8);
  return stories.length >= minimum ? stories : [];
}

/** “Découpage proposé” comment: readable on GitHub, and readable back by ADA (hidden data). */
export function breakdownText(explanation: string, stories: ProposedStory[]): string {
  const readable = stories
    .map(
      (story, rank) =>
        `${rank + 1}. **${story.title}**${story.duplicateOf ? ` _(recoupe #${story.duplicateOf}, déjà dans le projet)_` : ''} — en tant que ${story.role}, je veux ${story.need}, afin de ${story.benefit}.\n` +
        story.criteria.map((criterion) => `   - ${criterion}`).join('\n'),
    )
    .join('\n');
  const data = Buffer.from(JSON.stringify(stories), 'utf8').toString('base64');
  return `${explanation}\n\n**Stories proposées** (à choisir dans ADA) :\n${readable}\n\n<!-- ${BREAKDOWN_MARKER} ${data} -->`;
}

export function readBreakdown(text: string): ProposedStory[] {
  const data = BREAKDOWN_DATA.exec(text)?.[1];
  if (!data) return [];
  try {
    return cleanProposedStories(JSON.parse(Buffer.from(data, 'base64').toString('utf8')), 1); // read back as ADA wrote it
  } catch {
    return [];
  }
}

/**
 * Body of a story created by ADA: that of the story form, plus the link to the parent request
 * (breakdown). Proposed during a conversation: its origin only, without a parent link (the
 * conversation goes on, it does not wait for these stories to end).
 */
export function formatStory(story: ProposedStory, parent: number, origin: 'breakdown' | 'conversation' = 'breakdown'): string {
  return [
    '### En tant que',
    '',
    story.role,
    '',
    '### Je veux',
    '',
    story.need,
    '',
    '### Afin de',
    '',
    story.benefit,
    '',
    "### Critères d'acceptation",
    '',
    ...story.criteria.map((criterion) => `- ${criterion}`),
    '',
    ...(origin === 'conversation'
      ? [ORIGIN_SECTION, '', `#${parent} — story proposée par ADA pendant la conversation, publiée depuis ADA.`]
      : [PARENT_SECTION, '', `#${parent} — story créée depuis ADA, à partir du découpage qu’elle a proposé.`]),
  ].join('\n');
}

/** Number of the parent request of a story created by a breakdown; null otherwise. */
export function readParent(body: string): number | null {
  const section = body.split(PARENT_SECTION)[1];
  const number = section ? /#(\d+)/.exec(section)?.[1] : undefined;
  return number ? Number(number) : null;
}

/** Adds to the body of the parent request the list of its stories, as checkboxes. */
export function addBreakdown(body: string, children: { number: number; title: string }[]): string {
  const list = children.map((child) => `- [ ] #${child.number} ${child.title}`).join('\n');
  return `${body.trimEnd()}\n\n${BREAKDOWN_SECTION}\n\nDemande découpée en ${children.length} stories, réalisées une par une. Chaque case se coche quand la story est livrée.\n\n${list}\n`;
}

/** Ticks the delivered story in the body of the parent; says whether all its stories are. */
export function checkChild(body: string, number: number): { body: string; allDelivered: boolean } {
  const checked = body.replace(new RegExp(`^- \\[ \\] #${number}(?=\\s)`, 'm'), `- [x] #${number}`);
  const section = checked.split(BREAKDOWN_SECTION)[1] ?? '';
  return { body: checked, allDelivered: /^- \[x\] #\d+/m.test(section) && !/^- \[ \] #\d+/m.test(section) };
}

/**
 * Stories to publish, reviewed by the PO: 1 to 8, each complete (title, role, need, benefit,
 * 1 to MAX_CRITERIA criteria). Otherwise an error that says which one to fix.
 */
export function validateStoriesToPublish(raw: unknown): ProposedStory[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestException('Cochez au moins une story à publier');
  if (raw.length > 8) throw new BadRequestException('8 stories au plus à la fois');
  return raw.map((element, rank) => {
    const input = (element ?? {}) as Record<string, unknown>;
    const story: ProposedStory = {
      title: shortText(input.title, 120),
      role: shortText(input.role, 200),
      need: shortText(input.need, 600),
      benefit: shortText(input.benefit, 600),
      criteria: (Array.isArray(input.criteria) ? input.criteria : []).map((criterion) => shortText(criterion, 300)).filter(Boolean),
    };
    const missing = [!story.title && 'le titre', !story.role && '« en tant que »', !story.need && '« je veux »', !story.benefit && '« afin de »'].filter(Boolean);
    if (missing.length) throw new BadRequestException(`Story ${rank + 1} : complétez ${missing.join(', ')}`);
    if (story.criteria.length < 1 || story.criteria.length > MAX_CRITERIA) {
      throw new BadRequestException(`Story ${rank + 1} : de 1 à ${MAX_CRITERIA} critères d’acceptation`);
    }
    return story;
  });
}

/**
 * Fingerprint of a request as the PO sees it (title and body of the issue). The screen sends it back
 * at launch: if the issue was modified on GitHub in the meantime, ADA refuses to launch a
 * version the PO has not read.
 */
export function workRequestFingerprint(title: string, body: string | null | undefined): string {
  return createHash('sha256').update(`${title}\n${body ?? ''}`).digest('hex').slice(0, 32);
}

