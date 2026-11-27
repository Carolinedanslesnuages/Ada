/** Reading the agent's answers (its final JSON), to pass on to the PO or to GitHub. */
import { cleanProposedStories, type ProposedStory } from '../stories/story.js';
import { CHOICE_MARKER, type AnalysisDecision, type ChoiceQuestion, type ImplementationResult } from './agent.js';

/**
 * ADA's answer in conversation: its message, whether the full checks pass (by default, yes),
 * and the stories it proposes to write (the PO chooses them, ADA publishes them under the PO's name).
 */
export interface ConversationEnd {
  response: string;
  ready: boolean;
  stories: ProposedStory[];
}

/** End of conversation: the answer, and whether the full checks pass (by default, yes). */
export function readConversationEnd(text: string): ConversationEnd | null {
  const response = readConversationReply(text);
  if (!response) return null;
  const json = readJson<{ ready?: unknown; stories?: unknown }>(text, (value) => 'response' in value);
  return { response, ready: json?.ready !== false, stories: cleanProposedStories(json?.stories, 1) };
}

/** ADA's answer in conversation: its JSON, or failing that its raw text (better than a blocker). */
export function readConversationReply(text: string): string | null {
  const json = readJson<{ response?: unknown }>(text, (value) => 'response' in value);
  if (json && typeof json.response === 'string' && json.response.trim()) return json.response.trim();
  const raw = text.replace(/```(?:json)?/g, '').trim();
  return raw && !raw.startsWith('{') ? raw : null;
}

/** Extracts the last JSON object of an answer (the agent sometimes wraps it in ```json). */
export function readJson<T>(text: string, accept: (value: Record<string, unknown>) => boolean = () => true): T | null {
  const cleaned = text.replace(/```(?:json)?/g, '');
  // From the end to the start: the agent's final JSON, even if it contains nested objects
  // (its choices) or if text precedes it. An object starts with “{” then a key, with or without
  // a line break: some models indent their JSON.
  const starts = [...cleaned.matchAll(/\{\s*"/g)].map((found) => found.index as number).reverse();
  for (const start of starts) {
    for (let end = cleaned.lastIndexOf('}'); end > start; end = cleaned.lastIndexOf('}', end - 1)) {
      try {
        const value = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
        if (value && typeof value === 'object' && !Array.isArray(value) && accept(value as Record<string, unknown>)) return value as T;
      } catch {
        // not a complete JSON: a shorter end is tried
      }
    }
  }
  return null;
}

export function readDecision(text: string): AnalysisDecision | null {
  const r = readJson<AnalysisDecision>(text, (value) => 'decision' in value);
  if (!(r && ['questions', 'plan', 'breakdown', 'waiting'].includes(r.decision) && typeof r.text === 'string' && r.text.trim())) return null;
  if (r.decision === 'breakdown') {
    const stories = cleanProposedStories(r.stories);
    // Unusable breakdown: the explanation is kept, like questions (previous behaviour).
    return stories.length ? { decision: 'breakdown', text: r.text, stories } : { decision: 'questions', text: r.text };
  }
  const choice = r.decision === 'questions' ? cleanChoices(r.choice) : [];
  return { decision: r.decision, text: r.text, ...(choice.length ? { choice } : {}) };
}

/** Keeps only well-formed choice questions (at most 3, 2 to 6 short options, no duplicate). */
export function cleanChoices(raw: unknown): ChoiceQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((element) => element as Partial<ChoiceQuestion>)
    .filter((element) => typeof element?.question === 'string' && element.question.trim() && Array.isArray(element.choice))
    .map((element) => ({
      // ADA numbers the questions itself: the number the assistant may have added (“1.”) is removed.
      question: element.question!.trim().replace(/^\d+\s*[.)]\s*/, '').slice(0, 300),
      choice: [...new Set((element.choice as unknown[]).filter((option): option is string => typeof option === 'string' && option.trim() !== '').map((option) => option.trim().slice(0, 200)))].slice(0, 6),
      several: element.several === true,
    }))
    .filter((element) => element.choice.length >= 2)
    .slice(0, 3);
}

/**
 * Text of the questions comment: readable on GitHub (options as “- [ ]” boxes) and, at the end,
 * the structured choices for ADA's screen, in an HTML comment (encoded: no “--”).
 */
export function questionsText(decision: AnalysisDecision): string {
  if (!decision.choice?.length) return decision.text;
  const readable = decision.choice
    .map(
      (question, rank) =>
        `${rank + 1}. ${question.question} (${question.several ? 'plusieurs réponses possibles' : 'une seule réponse'})\n` +
        question.choice.map((option) => `   - [ ] ${option}`).join('\n'),
    )
    .join('\n');
  const data = Buffer.from(JSON.stringify(decision.choice), 'utf8').toString('base64');
  return `${decision.text}\n\n**Choix proposés** (à cocher dans ADA) :\n${readable}\n\n<!-- ${CHOICE_MARKER} ${data} -->`;
}

export function readResult(text: string): ImplementationResult | null {
  const r = readJson<ImplementationResult>(text, (value) => 'result' in value);
  if (r?.result === 'ok' && typeof r.summary === 'string') return r;
  if (r?.result === 'blocked' && typeof r.reason === 'string') return r;
  return null;
}
