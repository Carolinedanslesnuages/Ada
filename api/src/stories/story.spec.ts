import { describe, it, expect } from 'vitest';
import { lireBug, lireStory, statutDepuis, typeDepuis, verifierPrete } from './story.js';

const formulaireStory = (criteres: string) =>
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
    criteres,
  ].join('\n');

const formulaireBug = [
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

describe('Lecture des issues écrites dans GitHub', () => {
  it('relit une story saisie avec le formulaire user-story.yml', () => {
    expect(lireStory(formulaireStory('- une salle sans réservation est libre\n- triées par nom'))).toEqual({
      role: "agent d'accueil",
      besoin: 'voir les salles libres',
      benefice: 'proposer une salle',
      criteres: ['une salle sans réservation est libre', 'triées par nom'],
    });
  });

  it('relit un problème saisi avec le formulaire bug.yml, champ facultatif vide', () => {
    expect(lireBug(formulaireBug)).toEqual({
      constate: 'Aucune salle le lundi',
      attendu: 'Les salles libres',
      etapes: '1. Ouvrir la liste un lundi',
      ecran: '',
    });
  });

  it('ne reconnaît pas une issue écrite librement', () => {
    expect(lireStory('Il faudrait une page d’accueil')).toBeNull();
    expect(lireBug('Ça ne marche pas')).toBeNull();
  });
});

describe('Une demande est-elle prête à être lancée ?', () => {
  it('oui : story complète, 4 critères au plus', () => {
    expect(verifierPrete('story', lireStory(formulaireStory('- a\n- b\n- c\n- d')), null)).toEqual({ prete: true });
  });

  it('non : plus de 4 critères, il faut la découper sur GitHub', () => {
    const resultat = verifierPrete('story', lireStory(formulaireStory('- a\n- b\n- c\n- d\n- e')), null);
    expect(resultat).toEqual({ prete: false, raison: expect.stringMatching(/Plus de 4 critères/) });
  });

  it('non : aucun critère', () => {
    expect(verifierPrete('story', lireStory(formulaireStory('')), null)).toEqual({
      prete: false,
      raison: 'Aucun critère d’acceptation',
    });
  });

  it('non : story écrite hors du formulaire', () => {
    expect(verifierPrete('story', null, null)).toEqual({ prete: false, raison: expect.stringMatching(/formulaire/) });
  });

  it('oui : problème complet ; non : sans étapes de reproduction', () => {
    expect(verifierPrete('bug', null, lireBug(formulaireBug))).toEqual({ prete: true });
    const sansEtapes = { ...lireBug(formulaireBug)!, etapes: '' };
    expect(verifierPrete('bug', null, sansEtapes)).toEqual({ prete: false, raison: expect.stringMatching(/reproduire/) });
  });
});

describe('Statut et type', () => {
  it('« livrée » quand l’issue est fermée, sinon le label de statut', () => {
    expect(statutDepuis('closed', ['story:en-cours'])).toBe('livree');
    expect(statutDepuis('open', ['user-story', 'story:questions'])).toBe('questions');
    expect(statutDepuis('open', ['user-story'])).toBe('nouvelle');
  });

  it('distingue un problème d’une story par son label', () => {
    expect(typeDepuis(['bug'])).toBe('bug');
    expect(typeDepuis(['user-story'])).toBe('story');
  });

  it('reconnaît une story ou un problème sans label, par le contenu du formulaire', () => {
    expect(typeDepuis([], formulaireStory('- a'))).toBe('story');
    expect(typeDepuis([], formulaireBug)).toBe('bug');
    expect(typeDepuis([], 'Une question libre')).toBeNull();
  });
});
