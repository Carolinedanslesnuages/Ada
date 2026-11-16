import { describe, it, expect } from 'vitest';
import { calculerIndicateurs, lireHistorique, type DemandeMesuree } from './indicateurs.js';

const livree = (lanceeLe: string | null, fermeeLe: string, besoinDev = false): DemandeMesuree => ({ livree: true, lanceeLe, fermeeLe, besoinDev });
const ouverte: DemandeMesuree = { livree: false, lanceeLe: '2026-11-16T10:00:00Z', fermeeLe: null, besoinDev: true };

describe('Indicateurs', () => {
  it('compte les projets et les stories livrées, sur l’ensemble et par projet', () => {
    const indicateurs = calculerIndicateurs([
      { nom: 'pret', demandes: [livree(null, '2026-11-16T12:00:00Z'), livree(null, '2026-11-16T13:00:00Z'), ouverte] },
      { nom: 'annuaire', demandes: [livree(null, '2026-11-16T12:00:00Z')] },
      { nom: 'vide', demandes: [] },
    ]);
    expect(indicateurs.projets).toBe(3);
    expect(indicateurs.storiesLivrees).toBe(3);
    expect(indicateurs.parProjet.map((projet) => [projet.nom, projet.storiesLivrees])).toEqual([
      ['pret', 2],
      ['annuaire', 1],
      ['vide', 0],
    ]);
  });

  it('part des livrées sans passage par « Besoin d’un développeur » (les demandes en cours ne comptent pas)', () => {
    const indicateurs = calculerIndicateurs([
      { nom: 'pret', demandes: [livree(null, '2026-11-16T12:00:00Z'), livree(null, '2026-11-16T12:00:00Z', true), livree(null, '2026-11-16T12:00:00Z'), livree(null, '2026-11-16T12:00:00Z'), ouverte] },
    ]);
    expect(indicateurs.partSansDev).toBe(0.75);
    expect(calculerIndicateurs([{ nom: 'vide', demandes: [ouverte] }]).partSansDev).toBeNull();
  });

  it('temps moyen du lancement à la livraison, en minutes, sans les demandes jamais lancées depuis ADA', () => {
    const indicateurs = calculerIndicateurs([
      { nom: 'pret', demandes: [livree('2026-11-16T10:00:00Z', '2026-11-16T10:20:00Z'), livree('2026-11-16T11:00:00Z', '2026-11-16T11:40:00Z'), livree(null, '2026-11-16T12:00:00Z')] },
    ]);
    expect(indicateurs.dureeMoyenneMinutes).toBe(30);
    expect(calculerIndicateurs([{ nom: 'ancien', demandes: [livree(null, '2026-11-16T12:00:00Z')] }]).dureeMoyenneMinutes).toBeNull();
  });

  it('lit le lancement et le passage par « besoin d’un développeur » dans l’historique des labels', () => {
    const historique = lireHistorique(
      [
        { event: 'labeled', created_at: '2026-11-16T10:05:00Z', label: { name: 'user-story' } },
        { event: 'labeled', created_at: '2026-11-16T10:10:00Z', label: { name: 'story:en-cours' } },
        { event: 'unlabeled', created_at: '2026-11-16T10:30:00Z', label: { name: 'story:en-cours' } },
        { event: 'labeled', created_at: '2026-11-16T10:31:00Z', label: { name: 'story:besoin-dev' } },
        { event: 'labeled', created_at: '2026-11-16T11:00:00Z', label: { name: 'story:en-cours' } },
        { event: 'closed', created_at: '2026-11-16T12:00:00Z' },
      ],
      'story:en-cours',
      'story:besoin-dev',
    );
    expect(historique).toEqual({ lanceeLe: '2026-11-16T10:10:00Z', besoinDev: true });
    expect(lireHistorique([], 'story:en-cours', 'story:besoin-dev')).toEqual({ lanceeLe: null, besoinDev: false });
  });
});
