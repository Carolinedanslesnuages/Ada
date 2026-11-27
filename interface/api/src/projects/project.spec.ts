import { describe, it, expect } from 'vitest';
import { normalizeName, customize, slugify, validateProject } from './project.js';

describe('Name of a new project', () => {
  it('turns the name into a GitHub repository address', () => {
    expect(slugify('Réservation de salles')).toBe('reservation-de-salles');
    expect(slugify('Suivi d’activité — 2027 !')).toBe('suivi-d-activite-2027');
  });

  it('removes leading and trailing dashes, even after the cut at 60 characters', () => {
    expect(slugify('--- Budget --- 2027 ---')).toBe('budget-2027');
    expect(slugify(`${'a'.repeat(59)} suite`)).toBe('a'.repeat(59));
  });

  it('replaces the straight apostrophe, which would break the generated code', () => {
    expect(normalizeName("  L'annuaire   des agents ")).toBe('L’annuaire des agents');
  });

  it('refuses quotes and angle brackets', () => {
    const result = validateProject({ name: 'Projet "test" <b>', objective: 'Un objectif assez long', template: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toMatch(/Lettres, chiffres/);
  });

  it('accepts an accented name and adds a final period to the objective', () => {
    const result = validateProject({
      name: "L'annuaire des agents",
      objective: 'Trouver   un collègue\net son bureau',
      template: 'vue-nest-dsfr',
    });
    expect(result).toEqual({
      ok: true,
      slug: 'l-annuaire-des-agents',
      project: { name: 'L’annuaire des agents', objective: 'Trouver un collègue et son bureau.', template: 'vue-nest-dsfr', idea: '', visibility: 'private', baseline: '', deployed: false },
    });
  });

  it('accepts an idea told freely, without an objective: the objective comes from its first sentence (#68)', () => {
    const result = validateProject({
      name: 'Covoiturage',
      template: 'vue-nest-dsfr',
      idea: '  bon en gros je voudrais que les agents puissent partager leurs trajets. genre le matin\net on verra pour le reste ',
    });
    expect(result).toMatchObject({
      ok: true,
      project: {
        idea: 'bon en gros je voudrais que les agents puissent partager leurs trajets. genre le matin\net on verra pour le reste',
        objective: 'bon en gros je voudrais que les agents puissent partager leurs trajets.',
      },
    });
  });

  it('requires an idea (or an objective), even a short one', () => {
    expect(validateProject({ name: 'Covoiturage', template: 'vue-nest-dsfr' })).toMatchObject({ ok: false, errors: { idea: 'Racontez votre idée, même en quelques mots' } });
    expect(validateProject({ name: 'Covoiturage', template: 'vue-nest-dsfr', idea: 'trajets' })).toMatchObject({ ok: false, errors: { idea: expect.stringContaining('une phrase') } });
  });

  it('accepts an optional baseline, without a straight apostrophe', () => {
    const result = validateProject({ name: 'POC Portail', objective: 'Piloter sa journée d’agent', template: 'x', baseline: "  Ma journée avec l'agent " });
    expect(result.ok && result.project.baseline).toBe('Ma journée avec l’agent');
  });

  it('refuses a baseline that is too long or contains quotes', () => {
    const long = validateProject({ name: 'POC Portail', objective: 'Piloter sa journée', template: 'x', baseline: 'a'.repeat(81) });
    expect(long.ok).toBe(false);
    const quotes = validateProject({ name: 'POC Portail', objective: 'Piloter sa journée', template: 'x', baseline: 'Le "portail"' });
    expect(quotes.ok).toBe(false);
    if (!quotes.ok) expect(quotes.errors.baseline).toMatch(/ponctuation simple/);
  });

  it('requires an objective of at least one sentence', () => {
    const result = validateProject({ name: 'Annuaire', objective: 'court', template: 'x' });
    expect(result.ok).toBe(false);
  });
});

describe('Template customization', () => {
  it('replaces every marker, everywhere', () => {
    const text = '# __NOM_PROJET__ (__SLUG__)\n__OBJECTIF__ — __DATE__ par __PO__ — __NOM_PROJET__ — « __BASELINE__ »';
    expect(
      customize(text, { name: 'Annuaire', slug: 'annuaire', objective: 'Trouver.', date: '2026-11-16', po: 'po1', baseline: 'Qui fait quoi' }),
    ).toBe('# Annuaire (annuaire)\nTrouver. — 2026-11-16 par po1 — Annuaire — « Qui fait quoi »');
  });

  it('leaves the baseline empty if the PO gave none (the DSFR then does not display it)', () => {
    expect(
      customize('service-description="__BASELINE__"', { name: 'A', slug: 'a', objective: 'B.', date: 'd', po: 'p', baseline: '' }),
    ).toBe('service-description=""');
  });
});
