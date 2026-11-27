import { describe, expect, it } from 'vitest';
import { readAdaConfig } from './ada-config.js';
import { fromLegacyAdaJson } from './legacy-ada-json.js';

describe('ada.json written before the switch to English', () => {
  const legacy = {
    type: 'tableau-de-bord',
    personnaliser: ['README.md'],
    controlesRequis: ['API (lint, tests, compilation)'],
    controles: ['cd /app && npm test'],
    deploiement: { chart: 'charts/app' },
    apercu: { base: 'postgres', npm: ['api'], avant: ['echo before'], arrierePlan: ['npm run start:dev'], principal: 'npx vite', port: 5173 },
  };

  it('is read with its French keys and project type', () => {
    expect(readAdaConfig(JSON.stringify(legacy))).toMatchObject({
      type: 'dashboard',
      customize: ['README.md'],
      requiredChecks: ['API (lint, tests, compilation)'],
      checks: ['cd /app && npm test'],
      deployment: { chart: 'charts/app' },
      preview: { database: 'postgres', npm: ['api'], before: ['echo before'], background: ['npm run start:dev'], main: 'npx vite', port: 5173 },
    });
  });

  it('keeps the English key when both spellings are present', () => {
    expect(fromLegacyAdaJson({ controles: ['old'], checks: ['new'] })).toEqual({ checks: ['new'] });
  });

  it('leaves a current ada.json untouched', () => {
    const current = { type: 'mockup', checks: ['npm test'], preview: { main: 'npx vite' } };
    expect(fromLegacyAdaJson(current)).toEqual(current);
  });
});
