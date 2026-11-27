/** Large request: the agent that asks questions instead of breaking down is relaunched once. */
import type { WorkRequest } from './agent.js';

/** Beyond this number of characters, a first analysis that asks questions is relaunched as a breakdown. */
export const LARGE_WORK_REQUEST_THRESHOLD = 1500;

function workRequestSize(workRequest: WorkRequest): number {
  const { content, freeContent } = workRequest;
  const story = content ? [content.role, content.need, content.benefit, ...content.criteria].join(' ') : '';
  return story.length + (freeContent ?? '').length;
}

/**
 * True for a first analysis (the PO has not answered anything yet) of a long request, unless the
 * questions are about a duplicate (they quote an existing story: the PO must decide).
 */
export function isLargeWorkRequest(workRequest: WorkRequest, questions: string): boolean {
  if (workRequest.type === 'bug' || workRequest.exchanges.some((exchange) => exchange.author === 'po')) return false;
  if (workRequest.existingStories?.length && /#\d+/.test(questions)) return false;
  return workRequestSize(workRequest) >= LARGE_WORK_REQUEST_THRESHOLD;
}

/** Addition to the analysis instructions for the second attempt. */
export function breakdownRetry(questions: string): string {
  return `

RELANCE — ta première réponse posait des questions :
${questions.slice(0, 1500)}

Cette demande est vaste : ne pose pas de questions maintenant. Réponds par la décision « breakdown » :
2 à 8 petites stories dans l'ordre de réalisation, avec tes hypothèses écrites dans leurs critères.
Le PO les corrigera avant de les publier, et tu poseras tes questions sur chaque story ensuite.`;
}
