import { describe, it, expect } from 'vitest';
import {
  CRITERES_MAX,
  validerStory,
  formaterCorps,
  lireCorps,
  statutDepuis,
  type NouvelleStory,
} from './story.js';

const story: NouvelleStory = {
  titre: 'Voir les salles libres',
  role: "agent d'accueil",
  besoin: 'voir la liste des salles libres en ce moment',
  benefice: 'proposer une salle à un visiteur sans appeler le service',
  criteres: [
    "une salle est libre si aucune réservation ne couvre l'heure actuelle",
    'pour chaque salle : nom, étage, nombre de places',
  ],
};

describe('Validation d’une story', () => {
  it('accepte une story complète et courte', () => {
    expect(validerStory(story)).toEqual({ ok: true, story });
  });

  it(`refuse plus de ${CRITERES_MAX} critères d’acceptation (story trop grosse)`, () => {
    const resultat = validerStory({ ...story, criteres: ['a b c', 'd e f', 'g h i', 'j k l', 'm n o'] });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.erreurs.criteres).toMatch(/4 critères au maximum/);
  });

  it('refuse une story sans critère d’acceptation', () => {
    const resultat = validerStory({ ...story, criteres: [] });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.erreurs.criteres).toMatch(/au moins un critère/);
  });

  it('refuse un rôle, un besoin ou un bénéfice vide', () => {
    const resultat = validerStory({ ...story, role: ' ', besoin: '', benefice: '' });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(Object.keys(resultat.erreurs).sort()).toEqual(['benefice', 'besoin', 'role']);
  });

  it('nettoie les espaces et ignore les critères vides', () => {
    const resultat = validerStory({ ...story, titre: '  Voir les salles libres ', criteres: [' a b c ', '  '] });
    expect(resultat).toEqual({ ok: true, story: { ...story, criteres: ['a b c'] } });
  });
});

describe('Mise en forme de la story en issue GitHub', () => {
  it('produit un corps lisible avec les critères en cases à cocher', () => {
    const corps = formaterCorps(story);
    expect(corps).toContain("**En tant que** agent d'accueil,");
    expect(corps).toContain('- [ ] pour chaque salle : nom, étage, nombre de places');
    expect(corps).toContain('<!-- atelier-po:story v1 -->');
  });

  it('relit le corps produit sans perte', () => {
    const { titre: _titre, ...sansTitre } = story;
    expect(lireCorps(formaterCorps(story))).toEqual(sansTitre);
  });

  it('renvoie null pour une issue qui n’a pas été créée par l’atelier', () => {
    expect(lireCorps('Un texte libre')).toBeNull();
  });
});

describe('Statut d’une story', () => {
  it('est « livrée » quand l’issue est fermée', () => {
    expect(statutDepuis('closed', ['story:en-cours'])).toBe('livree');
  });
  it('suit le label de statut quand l’issue est ouverte', () => {
    expect(statutDepuis('open', ['user-story', 'story:questions'])).toBe('questions');
  });
  it('est « nouvelle » sans label de statut', () => {
    expect(statutDepuis('open', ['user-story'])).toBe('nouvelle');
  });
});
