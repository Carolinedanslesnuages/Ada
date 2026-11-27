/**
 * ada.json files written before the format switched to English (keys and project types in French).
 * Projects created earlier still carry them: they are read as is, so that no existing repository
 * has to be changed. This file is the only place where the French names remain.
 */
const LEGACY_KEYS: Record<string, string> = {
  personnaliser: 'customize',
  controlesRequis: 'requiredChecks',
  controles: 'checks',
  deploiement: 'deployment',
  apercu: 'preview',
  base: 'database',
  avant: 'before',
  arrierePlan: 'background',
  principal: 'main',
};

const LEGACY_TYPES: Record<string, string> = {
  formulaire: 'form',
  'tableau-de-bord': 'dashboard',
  gestion: 'management',
  carte: 'map',
  formation: 'training',
  composant: 'component',
  traitement: 'processing',
  maquette: 'mockup',
};

/** Converts a parsed ada.json to the current format. An English key wins over its French twin. */
export function fromLegacyAdaJson(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const converted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const currentKey = LEGACY_KEYS[key] ?? key;
    if (currentKey !== key && currentKey in value) continue;
    converted[currentKey] = currentKey === 'preview' || currentKey === 'deployment' ? fromLegacyAdaJson(entry) : entry;
  }
  if (typeof converted.type === 'string') converted.type = LEGACY_TYPES[converted.type] ?? converted.type;
  return converted;
}
