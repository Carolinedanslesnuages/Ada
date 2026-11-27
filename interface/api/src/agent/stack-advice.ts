import type { Template } from '../projects/templates.js';

/**
 * Stack advice at creation (#68): the assistant reads the PO's idea and chooses, among the
 * shipped templates, the one that fits best. It only answers: no tool, no file.
 */
export interface StackAdvice {
  template: string;
  /** One sentence, in business language, that explains the choice to the PO. */
  reason: string;
}

/** Tools refused to the assistant during the advice: it reads the idea and answers, nothing else. */
export const FORBIDDEN_ADVICE_TOOLS = ['Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Task'];

export function stackAdviceInstructions(idea: string, templates: Pick<Template, 'id' | 'type' | 'label' | 'purpose'>[], types: { id: string; label: string; description: string }[]): string {
  const typeLabelText = (id: string) => types.find((type) => type.id === id)?.label ?? id;
  const catalog = templates.map((template) => `- ${template.id} : ${typeLabelText(template.type)} — ${template.label} (${template.purpose})`).join('\n');
  return `Tu conseilles un Product Owner, qui n'est pas développeur, au moment de créer son projet.
Voici son idée, telle qu'il l'a racontée (elle peut être courte ou désordonnée) :
"""
${idea}
"""

Choisis le modèle de projet le plus adapté, UNIQUEMENT parmi cette liste (identifiant : description) :
${catalog}

Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"template": "<identifiant exact de la liste>", "reason": "<une seule phrase courte (25 mots au maximum), en français simple et sans jargon, qui explique ce choix au PO>"}
N'utilise aucun outil. N'invente aucun identifiant.`;
}

/** Cuts a text that is too long at the end of a sentence, otherwise of a word (never mid-word). */
function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const start = text.slice(0, max);
  const sentenceEnd = Math.max(start.lastIndexOf('. '), start.lastIndexOf('! '), start.lastIndexOf('? '));
  if (sentenceEnd > max / 2) return start.slice(0, sentenceEnd + 1);
  return `${start.slice(0, start.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
}

/** Reads the assistant's answer; null if it is unreadable or proposes a template outside the list. */
export function readStackAdvice(response: string, identifiers: string[]): StackAdvice | null {
  const json = response.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const { template, reason } = JSON.parse(json) as { template?: unknown; reason?: unknown };
    if (typeof template !== 'string' || !identifiers.includes(template)) return null;
    return { template, reason: typeof reason === 'string' ? truncateText(reason.replace(/\s+/g, ' ').trim(), 300) : '' };
  } catch {
    return null;
  }
}
