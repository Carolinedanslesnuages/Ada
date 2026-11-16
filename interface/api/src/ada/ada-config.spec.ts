import { describe, it, expect } from 'vitest';
import { ADA_PAR_DEFAUT, lireAdaConfig } from './ada-config.js';

describe('ada.json — description d’un modèle', () => {
  it('sans fichier : comportement des projets existants (Vue + NestJS + PostgreSQL)', () => {
    expect(lireAdaConfig(null)).toBe(ADA_PAR_DEFAUT);
    expect(ADA_PAR_DEFAUT.apercu.base).toBe('postgres');
  });

  it('lit une maquette sans base ni API, avec les valeurs par défaut', () => {
    const config = lireAdaConfig(
      JSON.stringify({
        type: 'maquette',
        controlesRequis: ['Maquette'],
        controles: ['cd /app && npm test'],
        apercu: { npm: ['.'], principal: 'cd /app && npx vite --host 0.0.0.0 --port 5173' },
      }),
    );
    expect(config).toMatchObject({ type: 'maquette', personnaliser: [], apercu: { base: null, image: 'node:24-bookworm', port: 5173, avant: [], arrierePlan: [] } });
  });

  it('refuse un ada.json incomplet, en disant quoi', () => {
    expect(() => lireAdaConfig(JSON.stringify({ type: 'fusee', apercu: {} }))).toThrow(/ada\.json invalide : .*type/);
  });
});
