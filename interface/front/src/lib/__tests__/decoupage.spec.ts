import { describe, it, expect } from 'vitest'
import { readBreakdown, readParentStories, ASSISTANT_MARKER, presentMessage, type ProposedStory } from '../story'

const STORIES: ProposedStory[] = [
  { title: 'Voir le matériel', role: 'agent', need: 'voir la liste', benefit: 'savoir', criteria: ['Liste'] },
  { title: 'Emprunter', role: 'agent', need: 'emprunter', benefit: 'éviter Excel', criteria: ['Bouton'] },
]
const encode = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
const proposition = `${ASSISTANT_MARKER}\n🤖 **Découpage proposé**\n\nTrop gros.\n\n**Stories proposées** (à choisir dans ADA) :\n1. **Voir le matériel** — …\n\n<!-- ada:decoupage ${encode(STORIES)} -->`

describe('Proposed breakdown (#36)', () => {
  it('reads the proposed stories, accents included', () => {
    expect(readBreakdown(proposition)).toEqual(STORIES)
    expect(readBreakdown('rien')).toEqual([])
  })

  it('displays in the feed only the explanation (the proposal is in the form)', () => {
    expect(presentMessage({ id: 1, author: 'robot', avatar: null, at: '', text: proposition }).text).toBe('🤖 **Découpage proposé**\n\nTrop gros.')
  })

  it('reads the stories of a parent request, delivered or not', () => {
    const body = '### Demande\n\nTout\n\n### Découpage\n\nDemande découpée en 2 stories.\n\n- [x] #7 Voir le matériel\n- [ ] #8 Emprunter\n'
    expect(readParentStories(body)).toEqual([
      { number: 7, title: 'Voir le matériel', delivered: true },
      { number: 8, title: 'Emprunter', delivered: false },
    ])
    expect(readParentStories('### Demande\n\n- [ ] #3 pas une story du découpage')).toEqual([])
  })
})
