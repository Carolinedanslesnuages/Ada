import { describe, it, expect } from 'vitest'
import { splitTextBlock, readSegments, readRichText } from '../rich-text'

describe('Formatting of ADA\'s messages', () => {
  it('recognizes subheadings, bulleted and numbered lists, paragraphs', () => {
    const blocks = readRichText(
      [
        '🤖 **Plan proposé**',
        '',
        'La demande est claire.',
        'Voici ce que je propose.',
        '',
        '**Ce qui va changer pour l’utilisateur**',
        '- Un bouton **Emprunter** sur chaque objet',
        '- Un message de confirmation',
        '',
        '## Comment je vérifie',
        '1. Un test par critère',
        '2. Un test d’accessibilité',
      ].join('\n'),
    )
    // A line that ends a sentence is a paragraph of its own, even without an empty line.
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'paragraph', 'subheading', 'list', 'subheading', 'list'])
    expect(blocks[1]).toEqual({ type: 'paragraph', segments: [{ text: 'La demande est claire.' }] })
    expect(blocks[2]).toEqual({ type: 'paragraph', segments: [{ text: 'Voici ce que je propose.' }] })
    expect(blocks[3]).toEqual({ type: 'subheading', segments: [{ text: 'Ce qui va changer pour l’utilisateur' }] })
    expect(blocks[4]).toMatchObject({ ordered: false, elements: [[{ text: 'Un bouton ' }, { text: 'Emprunter', bold: true }, { text: ' sur chaque objet' }], [{ text: 'Un message de confirmation' }]] })
    expect(blocks[6]).toMatchObject({ ordered: true, elements: [[{ text: 'Un test par critère' }], [{ text: 'Un test d’accessibilité' }]] })
  })

  it('a sentence split over two lines stays a single paragraph', () => {
    expect(readRichText('Le tirage au sort se fait\nune seule fois par édition.')).toEqual([
      { type: 'paragraph', segments: [{ text: 'Le tirage au sort se fait une seule fois par édition.' }] },
    ])
  })

  it('splits a big block of text between two sentences, never in the middle of one', () => {
    const textBlock = Array.from({ length: 8 }, (_, rank) => `Voici la phrase numéro ${rank + 1}, assez longue pour compter vraiment.`).join(' ')
    const blocks = readRichText(textBlock)
    expect(blocks.length).toBeGreaterThan(1)
    for (const block of blocks) {
      const text = block.type === 'paragraph' ? block.segments.map((segment) => segment.text).join('') : ''
      expect(text.length).toBeLessThanOrEqual(280)
      expect(text).toMatch(/^Voici .*\.$/)
    }
    expect(splitTextBlock('Court.')).toEqual(['Court.'])
  })

  it('bold and inline code; a lone star stays text', () => {
    expect(readSegments('Voir `ada.json` et **ceci** * pas cela')).toEqual([
      { text: 'Voir ' },
      { text: 'ada.json', code: true },
      { text: ' et ' },
      { text: 'ceci', bold: true },
      { text: ' * pas cela' },
    ])
  })

  it('never produces HTML: a tag stays text', () => {
    expect(readRichText('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'paragraph', segments: [{ text: '<img src=x onerror=alert(1)>' }] },
    ])
  })
})
