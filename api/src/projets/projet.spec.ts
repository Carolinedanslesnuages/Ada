import { describe, it, expect } from 'vitest';
import { normaliserNom, personnaliser, slugifier, validerProjet } from './projet.js';

describe('Nom d’un nouveau projet', () => {
  it('transforme le nom en adresse de dépôt GitHub', () => {
    expect(slugifier('Réservation de salles')).toBe('reservation-de-salles');
    expect(slugifier('Suivi d’activité — 2027 !')).toBe('suivi-d-activite-2027');
  });

  it('remplace l’apostrophe droite, qui casserait le code généré', () => {
    expect(normaliserNom("  L'annuaire   des agents ")).toBe('L’annuaire des agents');
  });

  it('refuse les guillemets et chevrons', () => {
    const resultat = validerProjet({ nom: 'Projet "test" <b>', objectif: 'Un objectif assez long', modele: 'x' });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.erreurs.nom).toMatch(/Lettres, chiffres/);
  });

  it('accepte un nom accentué et ajoute un point final à l’objectif', () => {
    const resultat = validerProjet({
      nom: "L'annuaire des agents",
      objectif: 'Trouver   un collègue\net son bureau',
      modele: 'vue-nest-dsfr',
    });
    expect(resultat).toEqual({
      ok: true,
      slug: 'l-annuaire-des-agents',
      projet: { nom: 'L’annuaire des agents', objectif: 'Trouver un collègue et son bureau.', modele: 'vue-nest-dsfr' },
    });
  });

  it('exige un objectif d’au moins une phrase', () => {
    const resultat = validerProjet({ nom: 'Annuaire', objectif: 'court', modele: 'x' });
    expect(resultat.ok).toBe(false);
  });
});

describe('Personnalisation du modèle', () => {
  it('remplace tous les marqueurs, partout', () => {
    const texte = '# __NOM_PROJET__ (__SLUG__)\n__OBJECTIF__ — __DATE__ par __PO__ — __NOM_PROJET__';
    expect(
      personnaliser(texte, { nom: 'Annuaire', slug: 'annuaire', objectif: 'Trouver.', date: '2026-11-16', po: 'po1' }),
    ).toBe('# Annuaire (annuaire)\nTrouver. — 2026-11-16 par po1 — Annuaire');
  });
});
