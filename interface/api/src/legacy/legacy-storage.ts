/**
 * Files ADA stored before its code switched to English: field names and a few values were French.
 * They are read as is and converted on the fly, so that requests, activity, registry, footprint,
 * sessions and personal models written earlier keep working. Everything ADA writes now uses the
 * current names. With `legacy-ada-json.ts` and `legacy-env.ts`, this is where French names remain.
 */
const LEGACY_KEYS: Record<string, string> = {
  // frozen request
  numero: 'number',
  titre: 'title',
  contenu: 'content',
  besoin: 'need',
  benefice: 'benefit',
  criteres: 'criteria',
  contenuBug: 'bugContent',
  constate: 'observed',
  attendu: 'expected',
  etapes: 'steps',
  ecran: 'screen',
  contenuLibre: 'freeContent',
  lanceeLe: 'launchedAt',
  lanceePar: 'launchedBy',
  // status, exchanges, recovered statuses
  statut: 'status',
  le: 'at',
  auteur: 'author',
  texte: 'text',
  reprisLe: 'recoveredAt',
  // activity of a request
  debut: 'start',
  enCours: 'inProgress',
  erreur: 'error',
  journal: 'log',
  tete: 'head',
  // registry and footprint log
  origine: 'origin',
  par: 'by',
  projet: 'project',
  modele: 'model',
  tokensEntree: 'inputTokenCount',
  tokensSortie: 'outputTokenCount',
  // protection choice
  refusee: 'refused',
  // waiting queue (task)
  tache: 'task',
  jeton: 'token',
  depot: 'repository',
  reprise: 'adoption',
  finaliser: 'finalize',
  // session and personal model
  utilisateur: 'user',
  jetonExpireLe: 'tokenExpiresAt',
  jetonRafraichissement: 'refreshToken',
  etatOAuth: 'oauthState',
  nom: 'name',
  adresse: 'address',
  cle: 'key',
};

/** Values that were French, by (current) field name. */
const LEGACY_VALUES: Record<string, Record<string, string>> = {
  status: {
    nouvelle: 'new',
    'en-cours': 'in-progress',
    'plan-a-valider': 'plan-to-approve',
    'en-verification': 'in-review',
    'besoin-dev': 'needs-developer',
    decoupage: 'breakdown',
    attente: 'waiting',
    echange: 'exchange',
    livree: 'delivered',
  },
  phase: { analyse: 'analysis', realisation: 'implementation', reprise: 'adoption' },
  type: { libre: 'free' },
  origin: { cree: 'created', repris: 'adopted', inconnue: 'unknown' },
};

/** Converts a stored JSON value (object, list, or anything) to the current field names and values. */
export function fromLegacyStorage<Stored>(value: unknown): Stored {
  if (Array.isArray(value)) return value.map((entry) => fromLegacyStorage(entry)) as Stored;
  if (!value || typeof value !== 'object') return value as Stored;
  const converted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const currentKey = LEGACY_KEYS[key] ?? key;
    if (currentKey !== key && currentKey in value) continue;
    const legacyValues = LEGACY_VALUES[currentKey];
    converted[currentKey] = legacyValues && typeof entry === 'string' ? (legacyValues[entry] ?? entry) : fromLegacyStorage(entry);
  }
  return converted as Stored;
}

/** Parses a stored JSON text, whatever the version of ADA that wrote it. */
export function parseStored<Stored>(text: string): Stored {
  return fromLegacyStorage<Stored>(JSON.parse(text));
}
