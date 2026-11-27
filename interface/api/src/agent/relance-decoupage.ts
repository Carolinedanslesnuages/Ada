/** Demande vaste : l'agent qui pose des questions au lieu de découper est relancé une fois. */
import type { Demande } from './agent.js';

/** Au-delà de ce nombre de caractères, une première analyse qui pose des questions est relancée en découpage. */
export const SEUIL_DEMANDE_VASTE = 1500;

function tailleDemande(demande: Demande): number {
  const { contenu, contenuLibre } = demande;
  const story = contenu ? [contenu.role, contenu.besoin, contenu.benefice, ...contenu.criteres].join(' ') : '';
  return story.length + (contenuLibre ?? '').length;
}

/**
 * Vrai pour une première analyse (le PO n'a encore rien répondu) d'une demande longue, sauf si les
 * questions portent sur un doublon (elles citent une story existante : le PO doit trancher).
 */
export function demandeVaste(demande: Demande, questions: string): boolean {
  if (demande.type === 'bug' || demande.echanges.some((echange) => echange.auteur === 'po')) return false;
  if (demande.existantes?.length && /#\d+/.test(questions)) return false;
  return tailleDemande(demande) >= SEUIL_DEMANDE_VASTE;
}

/** Ajout à la consigne d'analyse pour la seconde tentative. */
export function relanceDecoupage(questions: string): string {
  return `

RELANCE — ta première réponse posait des questions :
${questions.slice(0, 1500)}

Cette demande est vaste : ne pose pas de questions maintenant. Réponds par la décision « decoupage » :
2 à 8 petites stories dans l'ordre de réalisation, avec tes hypothèses écrites dans leurs critères.
Le PO les corrigera avant de les publier, et tu poseras tes questions sur chaque story ensuite.`;
}
