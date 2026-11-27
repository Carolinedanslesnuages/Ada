import { describe, it, expect } from 'vitest';
import {
  addBreakdown,
  checkChild,
  formatStory,
  readBreakdown,
  readParent,
  readStory,
  cleanProposedStories,
  breakdownText,
  type ProposedStory,
} from './story.js';

const STORY: ProposedStory = { title: 'Voir le matériel', role: 'agent', need: 'voir la liste', benefit: 'savoir quoi emprunter', criteria: ['Liste du matériel'] };
const OTHER: ProposedStory = { ...STORY, title: 'Emprunter', need: 'emprunter un objet' };

describe('Breakdown of a request into stories (#36)', () => {
  it('keeps only complete stories (2 to 8, 1 to 4 criteria)', () => {
    expect(cleanProposedStories([STORY, OTHER])).toEqual([STORY, OTHER]);
    expect(cleanProposedStories([STORY])).toEqual([]);
    expect(cleanProposedStories([STORY, { ...OTHER, criteria: [] }])).toEqual([]);
    expect(cleanProposedStories([STORY, { ...OTHER, criteria: ['a', 'b', 'c', 'd', 'e'] }])[1]!.criteria).toHaveLength(4);
    expect(cleanProposedStories(Array.from({ length: 10 }, () => STORY))).toHaveLength(8);
  });

  it('writes the readable proposal on GitHub and reads it back identically', () => {
    const text = breakdownText('Trop gros pour une seule story.', [STORY, OTHER]);
    expect(text).toContain('1. **Voir le matériel** — en tant que agent, je veux voir la liste, afin de savoir quoi emprunter.');
    expect(readBreakdown(text)).toEqual([STORY, OTHER]);
    expect(readBreakdown('sans proposition')).toEqual([]);
  });

  it('reports on GitHub the story that overlaps an existing story, and keeps the information when read back', () => {
    const text = breakdownText('Trop gros.', [STORY, { ...OTHER, duplicateOf: 31 }]);
    expect(text).toContain('2. **Emprunter** _(recoupe #31, déjà dans le projet)_');
    expect(readBreakdown(text)[1]!.duplicateOf).toBe(31);
  });

  it('creates a story in the form format, which points to its parent request', () => {
    const body = formatStory(STORY, 4);
    expect(readStory(body)).toEqual({ role: 'agent', need: 'voir la liste', benefit: 'savoir quoi emprunter', criteria: ['Liste du matériel'] });
    expect(readParent(body)).toBe(4);
    expect(readParent('### En tant que\n\nagent')).toBeNull();
  });

  it('the parent request lists its stories as checkboxes, ticked one by one until the last', () => {
    const body = addBreakdown('### Demande\n\nTout le prêt de matériel', [
      { number: 7, title: 'Voir le matériel' },
      { number: 8, title: 'Emprunter' },
    ]);
    expect(body).toContain('- [ ] #7 Voir le matériel\n- [ ] #8 Emprunter');
    const first = checkChild(body, 7);
    expect(first.body).toContain('- [x] #7 Voir le matériel\n- [ ] #8 Emprunter');
    expect(first.allDelivered).toBe(false);
    expect(checkChild(first.body, 8).allDelivered).toBe(true);
    expect(checkChild(body, 70).body).toBe(body);
  });
});
