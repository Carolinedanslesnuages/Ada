import { describe, it, expect } from 'vitest';
import {
  formatPrompt,
  readBug,
  readPrompt,
  readStory,
  statusFrom,
  promptTitle,
  typeFrom,
  checkReady,
  checkPrompt,
} from './story.js';

const storyForm = (criteria: string) =>
  [
    '### En tant que',
    '',
    "agent d'accueil",
    '',
    '### Je veux',
    '',
    'voir les salles libres',
    '',
    '### Afin de',
    '',
    'proposer une salle',
    '',
    "### Critères d'acceptation",
    '',
    criteria,
  ].join('\n');

const bugForm = [
  '### Ce qui se passe',
  '',
  'Aucune salle le lundi',
  '',
  '### Ce qui devrait se passer',
  '',
  'Les salles libres',
  '',
  '### Comment le reproduire',
  '',
  '1. Ouvrir la liste un lundi',
  '',
  '### Écran ou adresse concerné',
  '',
  '_No response_',
].join('\n');

describe('Reading the issues written in GitHub', () => {
  it('reads back a story entered with the user-story.yml form', () => {
    expect(readStory(storyForm('- une salle sans réservation est libre\n- triées par nom'))).toEqual({
      role: "agent d'accueil",
      need: 'voir les salles libres',
      benefit: 'proposer une salle',
      criteria: ['une salle sans réservation est libre', 'triées par nom'],
    });
  });

  it('reads back a bug entered with the bug.yml form, optional field empty', () => {
    expect(readBug(bugForm)).toEqual({
      observed: 'Aucune salle le lundi',
      expected: 'Les salles libres',
      steps: '1. Ouvrir la liste un lundi',
      screen: '',
    });
  });

  it('does not recognize a freely written issue', () => {
    expect(readStory('Il faudrait une page d’accueil')).toBeNull();
    expect(readBug('Ça ne marche pas')).toBeNull();
  });
});

describe('Is a request ready to be launched?', () => {
  it('yes: complete story, 4 criteria at most', () => {
    expect(checkReady('story', readStory(storyForm('- a\n- b\n- c\n- d')), null)).toEqual({ ready: true });
  });

  it('no: more than 4 criteria, it must be broken down on GitHub', () => {
    const result = checkReady('story', readStory(storyForm('- a\n- b\n- c\n- d\n- e')), null);
    expect(result).toEqual({ ready: false, reason: expect.stringMatching(/Plus de 4 critères/) });
  });

  it('no: no criterion', () => {
    expect(checkReady('story', readStory(storyForm('')), null)).toEqual({
      ready: false,
      reason: 'Aucun critère d’acceptation',
    });
  });

  it('no: story written outside the form', () => {
    expect(checkReady('story', null, null)).toEqual({ ready: false, reason: expect.stringMatching(/formulaire/) });
  });

  it('yes: complete bug; no: without reproduction steps', () => {
    expect(checkReady('bug', null, readBug(bugForm))).toEqual({ ready: true });
    const withoutSteps = { ...readBug(bugForm)!, steps: '' };
    expect(checkReady('bug', null, withoutSteps)).toEqual({ ready: false, reason: expect.stringMatching(/reproduire/) });
  });
});

describe('Status and type', () => {
  it('“delivered” when the issue is closed, otherwise the status label', () => {
    expect(statusFrom('closed', ['story:en-cours'])).toBe('delivered');
    expect(statusFrom('open', ['user-story', 'story:questions'])).toBe('questions');
    expect(statusFrom('open', ['user-story'])).toBe('new');
  });

  it('tells a bug from a story by its label', () => {
    expect(typeFrom(['bug'])).toBe('bug');
    expect(typeFrom(['user-story'])).toBe('story');
  });

  it('recognizes a story or a bug without a label, by the content of the form', () => {
    expect(typeFrom([], storyForm('- a'))).toBe('story');
    expect(typeFrom([], bugForm)).toBe('bug');
    expect(typeFrom([], 'Une question libre')).toBeNull();
  });
});

describe('Wild mode: free request', () => {
  it('saves the prompt in a format that can be read back, recognized as a free request', () => {
    const body = formatPrompt('  Mets le titre de la page en bleu  ');
    expect(body).toContain('### Demande libre (mode sauvage, hors story)');
    expect(readPrompt(body)).toBe('Mets le titre de la page en bleu');
    expect(typeFrom([], body)).toBe('free');
    expect(typeFrom(['mode-libre'], '')).toBe('free');
    expect(checkReady('free', null, null, readPrompt(body))).toEqual({ ready: true });
  });

  it('titles the issue with the beginning of the prompt', () => {
    expect(promptTitle('Ajoute un lien vers le guide dans le pied de page')).toBe(
      'Demande libre : Ajoute un lien vers le guide dans le pied de page',
    );
    expect(promptTitle('a'.repeat(80)).length).toBeLessThanOrEqual('Demande libre : '.length + 72);
  });

  it('keeps the first clause of the prompt, without cutting it in the middle of a word', () => {
    expect(
      promptTitle('Ajoute un filtre par catégorie au-dessus de la liste du matériel : Tous, Ordinateurs, Vidéoprojecteurs, Casques. Le filtre « Tous » est choisi par défaut.'),
    ).toBe('Demande libre : Ajoute un filtre par catégorie au-dessus de la liste du matériel');
    expect(promptTitle('Mets le titre en bleu. Et agrandis-le.')).toBe('Demande libre : Mets le titre en bleu');
    const long = promptTitle(`Ajoute ${'un très long morceau de phrase '.repeat(5)}`);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/\s…$/);
    expect(long.length).toBeLessThanOrEqual('Demande libre : '.length + 72);
  });

  it('refuses an empty or oversized prompt (a whole application is written as stories)', () => {
    expect(checkPrompt('  ')).toEqual({ ok: false, error: 'Décrivez votre demande en une phrase au moins' });
    const long = checkPrompt('x'.repeat(1001));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error).toMatch(/écrivez des stories/);
  });
});
