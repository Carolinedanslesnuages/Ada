import { describe, expect, it } from 'vitest';
import type { Demande } from './agent.js';
import { demandeVaste, relanceDecoupage } from './relance-decoupage.js';

function demande(parties: Partial<Demande> = {}, taille = 2000): Demande {
  return {
    numero: 1, titre: 'Vision', type: 'libre', contenu: null, contenuBug: null,
    contenuLibre: 'x'.repeat(taille), echanges: [], ...parties,
  };
}

describe('demandeVaste', () => {
  it('relance une première analyse longue', () => {
    expect(demandeVaste(demande(), 'Que voulez-vous ?')).toBe(true);
  });
  it('ne relance pas une demande courte', () => {
    expect(demandeVaste(demande({}, 300), 'Que voulez-vous ?')).toBe(false);
  });
  it('ne relance pas après une réponse du PO', () => {
    expect(demandeVaste(demande({ echanges: [{ auteur: 'po', texte: 'oui' }] }), 'Et ensuite ?')).toBe(false);
  });
  it('ne relance pas un signalement', () => {
    expect(demandeVaste(demande({ type: 'bug' }), 'Où ?')).toBe(false);
  });
  it('ne relance pas quand les questions portent sur un doublon', () => {
    const existantes = [{ numero: 4, titre: 'Liste', statut: 'livree' }] as unknown as Demande['existantes'];
    expect(demandeVaste(demande({ existantes }), 'Déjà prévu en #4 : continuer ici ?')).toBe(false);
  });
  it('compte le contenu d’une story', () => {
    const contenu = { role: 'a', besoin: 'y'.repeat(1600), benefice: 'b', criteres: ['c'] };
    expect(demandeVaste(demande({ type: 'story', contenu, contenuLibre: null }), 'Q ?')).toBe(true);
  });
  it('la relance rappelle les questions et demande un découpage', () => {
    expect(relanceDecoupage('Q1 ?')).toContain('Q1 ?');
    expect(relanceDecoupage('Q1 ?')).toContain('decoupage');
  });
});
