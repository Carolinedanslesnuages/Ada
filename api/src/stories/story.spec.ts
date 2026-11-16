import { describe, it, expect } from 'vitest';
import {
  CRITERES_MAX,
  validerStory,
  formaterCorps,
  lireCorps,
  statutDepuis,
  validerBug,
  formaterCorpsBug,
  lireCorpsBug,
  typeDepuis,
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

describe('Issues créées avec les formulaires GitHub', () => {
  const corpsFormulaire = [
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
    '- une salle sans réservation en cours est libre',
    '- triées par nom',
  ].join('\n');

  it('relit une story saisie avec le formulaire user-story.yml', () => {
    expect(lireCorps(corpsFormulaire)).toEqual({
      role: "agent d'accueil",
      besoin: 'voir les salles libres',
      benefice: 'proposer une salle',
      criteres: ['une salle sans réservation en cours est libre', 'triées par nom'],
    });
  });
});

describe('Signalement de problème', () => {
  const bug = {
    titre: 'La liste est vide le lundi',
    constate: 'Aucune salle ne s’affiche le lundi matin',
    attendu: 'Les salles libres s’affichent',
    etapes: '1. Ouvrir /salles-libres un lundi',
    ecran: '/salles-libres',
  };

  it('accepte un signalement complet, l’écran étant facultatif', () => {
    expect(validerBug({ ...bug, ecran: undefined })).toEqual({ ok: true, bug: { ...bug, ecran: '' } });
  });

  it('refuse un signalement sans étapes de reproduction', () => {
    const resultat = validerBug({ ...bug, etapes: '' });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.erreurs.etapes).toMatch(/reproduire/);
  });

  it('produit le même format que le formulaire GitHub bug.yml, et le relit', () => {
    const { titre: _titre, ...contenu } = bug;
    const corps = formaterCorpsBug(bug);
    expect(corps).toContain('### Comment le reproduire');
    expect(lireCorpsBug(corps)).toEqual(contenu);
  });

  it('distingue un bug d’une story par son label', () => {
    expect(typeDepuis(['bug'])).toBe('bug');
    expect(typeDepuis(['user-story', 'story:en-cours'])).toBe('story');
  });
});
