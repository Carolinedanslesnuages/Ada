/**
 * Formatting of the assistant's messages (simple Markdown: subheadings, lists, bold, code),
 * without ever injecting HTML: the text is split into blocks rendered by Vue tags, hence
 * escaped. Subheadings become bold text (no h1-h6: the heading hierarchy of
 * the page stays ADA's).
 */
export type Segment = { text: string; bold?: boolean; code?: boolean }
export type Block =
  | { type: 'subheading'; segments: Segment[] }
  | { type: 'paragraph'; segments: Segment[] }
  | { type: 'list'; ordered: boolean; elements: Segment[][] }

/** Inline **bold** and `code`. */
export function readSegments(line: string): Segment[] {
  const segments: Segment[] = []
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g
  let position = 0
  for (const found of line.matchAll(pattern)) {
    if (found.index > position) segments.push({ text: line.slice(position, found.index) })
    if (found[1] !== undefined) segments.push({ text: found[1], bold: true })
    else segments.push({ text: found[2]!, code: true })
    position = found.index + found[0].length
  }
  if (position < line.length) segments.push({ text: line.slice(position) })
  return segments
}

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBER = /^\s*\d+[.)]\s+(.*)$/
const SUBHEADING = /^\s*#{1,6}\s+(.*)$/
const BOLD_LINE = /^\s*\*\*([^*]+?)\*\*\s*:?\s*$/
/** A line that ends a sentence ends its paragraph (the assistant sometimes forgets the empty line). */
const SENTENCE_END = /[.!?…:]\s*$/
/** Beyond that, a paragraph is a wall of text: it is split between two sentences. */
const MAX_PARAGRAPH_LENGTH = 280

/** Splits a paragraph that is too long into paragraphs of a few sentences (never in the middle of a sentence). */
export function splitTextBlock(text: string, max = MAX_PARAGRAPH_LENGTH): string[] {
  if (text.length <= max) return [text]
  const phrases = text.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Ý0-9«"(])/)
  const pieces: string[] = []
  for (const phrase of phrases) {
    const last = pieces[pieces.length - 1]
    if (last !== undefined && last.length + 1 + phrase.length <= max) pieces[pieces.length - 1] = `${last} ${phrase}`
    else pieces.push(phrase)
  }
  return pieces
}

export function readRichText(text: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  const endParagraph = () => {
    for (const piece of paragraph.length ? splitTextBlock(paragraph.join(' ')) : []) {
      blocks.push({ type: 'paragraph', segments: readSegments(piece) })
    }
    paragraph = []
  }
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const bullet = BULLET.exec(line)
    const number = bullet ? null : NUMBER.exec(line)
    const subheading = SUBHEADING.exec(line)
    if (bullet || number) {
      endParagraph()
      const ordered = Boolean(number)
      const last = blocks[blocks.length - 1]
      const element = readSegments((bullet ?? number)![1]!)
      if (last?.type === 'list' && last.ordered === ordered) last.elements.push(element)
      else blocks.push({ type: 'list', ordered, elements: [element] })
    } else if (subheading) {
      endParagraph()
      blocks.push({ type: 'subheading', segments: readSegments(subheading[1]!.replace(/^\*\*(.*)\*\*$/, '$1')) })
    } else if (BOLD_LINE.test(line)) {
      // Line entirely in bold: it is a subheading (“**Accessibilité**”).
      endParagraph()
      blocks.push({ type: 'subheading', segments: [{ text: BOLD_LINE.exec(line)![1]! }] })
    } else if (!line.trim() || /^\s*-{3,}\s*$/.test(line)) {
      endParagraph()
    } else {
      paragraph.push(line.trim())
      if (SENTENCE_END.test(line)) endParagraph()
    }
  }
  endParagraph()
  return blocks
}
