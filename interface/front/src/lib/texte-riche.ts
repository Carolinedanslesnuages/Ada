/**
 * Mise en forme des messages de l'assistant (Markdown simple : intertitres, listes, gras, code),
 * sans jamais injecter de HTML : le texte est découpé en blocs rendus par des balises Vue, donc
 * échappé. Les intertitres deviennent du texte en gras (pas de h1-h6 : la hiérarchie de titres de
 * la page reste celle d'ADA).
 */
export type Segment = { texte: string; gras?: boolean; code?: boolean }
export type Bloc =
  | { type: 'intertitre'; segments: Segment[] }
  | { type: 'paragraphe'; segments: Segment[] }
  | { type: 'liste'; ordonnee: boolean; elements: Segment[][] }

/** **gras** et `code` en ligne. */
export function lireSegments(ligne: string): Segment[] {
  const segments: Segment[] = []
  const motif = /\*\*(.+?)\*\*|`([^`]+)`/g
  let position = 0
  for (const trouve of ligne.matchAll(motif)) {
    if (trouve.index > position) segments.push({ texte: ligne.slice(position, trouve.index) })
    if (trouve[1] !== undefined) segments.push({ texte: trouve[1], gras: true })
    else segments.push({ texte: trouve[2]!, code: true })
    position = trouve.index + trouve[0].length
  }
  if (position < ligne.length) segments.push({ texte: ligne.slice(position) })
  return segments
}

const PUCE = /^\s*[-*•]\s+(.*)$/
const NUMERO = /^\s*\d+[.)]\s+(.*)$/
const INTERTITRE = /^\s*#{1,6}\s+(.*)$/
const LIGNE_EN_GRAS = /^\s*\*\*([^*]+?)\*\*\s*:?\s*$/

export function lireTexteRiche(texte: string): Bloc[] {
  const blocs: Bloc[] = []
  let paragraphe: string[] = []
  const finirParagraphe = () => {
    if (paragraphe.length) blocs.push({ type: 'paragraphe', segments: lireSegments(paragraphe.join(' ')) })
    paragraphe = []
  }
  for (const ligne of texte.replace(/\r\n/g, '\n').split('\n')) {
    const puce = PUCE.exec(ligne)
    const numero = puce ? null : NUMERO.exec(ligne)
    const intertitre = INTERTITRE.exec(ligne)
    if (puce || numero) {
      finirParagraphe()
      const ordonnee = Boolean(numero)
      const derniere = blocs[blocs.length - 1]
      const element = lireSegments((puce ?? numero)![1]!)
      if (derniere?.type === 'liste' && derniere.ordonnee === ordonnee) derniere.elements.push(element)
      else blocs.push({ type: 'liste', ordonnee, elements: [element] })
    } else if (intertitre) {
      finirParagraphe()
      blocs.push({ type: 'intertitre', segments: lireSegments(intertitre[1]!.replace(/^\*\*(.*)\*\*$/, '$1')) })
    } else if (LIGNE_EN_GRAS.test(ligne)) {
      // Ligne entièrement en gras : c'est un intertitre (« **Accessibilité** »).
      finirParagraphe()
      blocs.push({ type: 'intertitre', segments: [{ texte: LIGNE_EN_GRAS.exec(ligne)![1]! }] })
    } else if (!ligne.trim() || /^\s*-{3,}\s*$/.test(ligne)) {
      finirParagraphe()
    } else {
      paragraphe.push(ligne.trim())
    }
  }
  finirParagraphe()
  return blocs
}
