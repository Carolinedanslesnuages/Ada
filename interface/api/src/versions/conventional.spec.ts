import { describe, it, expect } from 'vitest';
import { isConventionalTitle } from './conventional.js';

describe('Conventional Commits title (decides the semver version)', () => {
  it.each([
    'feat: AVOIR UNE BAR DE RECHERCHE',
    'fix: le bouton Envoyer reste actif',
    'feat(accueil): carte des applications',
    'feat!: nouveau format des réservations',
    'fix(sécurité): l’agent ne modifie plus .github/',
    'chore(main): release 0.2.0',
  ])('accepts “%s”', (title) => {
    expect(isConventionalTitle(title)).toBe(true);
  });

  it.each([
    'Merge pull request #6 from x/y',
    'Initial commit',
    'Revert "chore: baseline"',
    'feature: page',
    'feat:collé',
    'feat: ',
    'Feat: majuscule',
    'feat(): portée vide',
  ])('refuses “%s”', (title) => {
    expect(isConventionalTitle(title)).toBe(false);
  });
});
