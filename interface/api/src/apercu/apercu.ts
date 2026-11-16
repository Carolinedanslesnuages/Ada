import { ADA_PAR_DEFAUT, type AdaConfig } from '../ada/ada-config.js';

/** Fichiers et règles de l'aperçu d'un projet : fonctions pures, testées sans Docker. */

export const PORT_MIN = 5300;
export const PORT_MAX = 5399;
/** Liens de démonstration : une autre plage, pour ne jamais confondre démo et aperçu de travail. */
export const PLAGE_DEMO = { min: 5400, max: 5499 };
export const NOM_DEPOT = /^[a-z0-9][a-z0-9._-]{0,99}$/;

/** Cache npm commun à tous les aperçus (créé une fois) : seuls les premiers téléchargements sont lents. */
export const VOLUME_CACHE_NPM = 'atelier-po-cache-npm';
/** Cache pip commun aux aperçus Python (créé une fois). */
export const VOLUME_CACHE_PIP = 'atelier-po-cache-pip';

/** Volumes partagés entre aperçus, à créer avant le premier démarrage. */
export const volumesPartages = (config: AdaConfig): string[] => [VOLUME_CACHE_NPM, ...(config.apercu.pip.length ? [VOLUME_CACHE_PIP] : [])];

/**
 * Les images Node ont l'utilisateur « node » (1000) ; les autres (Python…) reçoivent « ada », avec
 * le même numéro 1000 : l'assistant travaille dans tout aperçu avec `-u 1000`.
 */
const imageNode = (config: AdaConfig) => config.apercu.image.startsWith('node:');
const MAISON_PYTHON = '/home/ada';

/** Premier port libre de la plage, ou celui déjà attribué au projet. */
export function attribuerPort(
  projet: string,
  attribues: Record<string, number>,
  plage: { min: number; max: number } = { min: PORT_MIN, max: PORT_MAX },
): number {
  if (attribues[projet]) return attribues[projet];
  const pris = new Set(Object.values(attribues));
  for (let port = plage.min; port <= plage.max; port++) if (!pris.has(port)) return port;
  throw new Error('Plus aucun port libre pour un aperçu : arrêtez des aperçus inutilisés');
}

const cheminDossier = (dossier: string) => (dossier === '.' ? '/app' : `/app/${dossier.replace(/^\.\//, '')}`);

/**
 * Conteneurs de l'aperçu, d'après ada.json : l'application, plus PostgreSQL si le modèle en a
 * besoin. Limités en mémoire et processeur ; dépendances dans des volumes (binaires Linux).
 */
export function genererCompose(
  projet: string,
  port: number,
  config: AdaConfig = ADA_PAR_DEFAUT,
  options: { nom?: string; hotesAutorises?: string[] } = {},
): string {
  const { apercu } = config;
  const hotes = (options.hotesAutorises ?? []).filter((hote) => /^[a-z0-9.-]+$/i.test(hote));
  const volumesModules = apercu.npm.map((dossier, index) => `      - modules_${index}:${cheminDossier(dossier)}/node_modules`);
  const base = apercu.base === 'postgres';
  const lignes = [
    `name: ${options.nom ?? `apercu-${projet}`}`,
    'services:',
    ...(base
      ? [
          '  db:',
          '    image: postgres:16',
          '    environment:',
          '      POSTGRES_USER: apercu',
          '      POSTGRES_PASSWORD: apercu',
          '      POSTGRES_DB: apercu',
          '    volumes:',
          '      - donnees:/var/lib/postgresql/data',
          '    healthcheck:',
          '      test: ["CMD-SHELL", "pg_isready -U apercu"]',
          '      interval: 3s',
          '      retries: 20',
          '    mem_limit: 256m',
        ]
      : []),
    '  app:',
    `    image: ${apercu.image}`,
    '    working_dir: /app',
    '    environment:',
    ...(base ? ['      DATABASE_URL: postgresql://apercu:apercu@db:5432/apercu?schema=public'] : []),
    '      NODE_ENV: development',
    ...(apercu.pip.length
      ? [
          '      VIRTUAL_ENV: /opt/venv',
          '      PATH: /opt/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          '      PIP_DISABLE_PIP_VERSION_CHECK: "1"',
          '      PYTHONDONTWRITEBYTECODE: "1"',
          '      PYTHONUNBUFFERED: "1"',
        ]
      : []),
    // Adresse publique (lien de démonstration) : le serveur de Vite refuse sinon un autre hôte.
    ...(hotes.length ? [`      __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: ${hotes.join(',')}`] : []),
    '    volumes:',
    '      - ./depot:/app',
    '      - ./demarrer.sh:/demarrer.sh:ro',
    '      - ./travail.sh:/travail.sh:ro',
    ...volumesModules,
    '      - cache_npm:/home/node/.npm',
    ...(apercu.pip.length ? ['      - venv:/opt/venv', `      - cache_pip:${MAISON_PYTHON}/.cache/pip`] : []),
    '    command: ["bash", "/demarrer.sh"]',
    '    ports:',
    `      - "127.0.0.1:${port}:${apercu.port}"`,
    ...(base ? ['    depends_on:', '      db:', '        condition: service_healthy'] : []),
    '    mem_limit: 1536m',
    '    cpus: 1',
    'volumes:',
    ...(base ? ['  donnees: {}'] : []),
    ...apercu.npm.map((_, index) => `  modules_${index}: {}`),
    '  cache_npm:',
    `    name: ${VOLUME_CACHE_NPM}`,
    '    external: true',
    ...(apercu.pip.length ? ['  venv: {}', '  cache_pip:', `    name: ${VOLUME_CACHE_PIP}`, '    external: true'] : []),
  ];
  return `${lignes.join('\n')}\n`;
}

/**
 * Lancé en root uniquement pour donner les volumes à l'utilisateur « node » (images Node), puis
 * travail.sh tourne en « node ». npm install (et non npm ci) : npm ci voudrait supprimer le point
 * de montage.
 */
export function genererScriptDemarrage(config: AdaConfig = ADA_PAR_DEFAUT): string {
  const volumes = [
    ...config.apercu.npm.map((dossier) => `${cheminDossier(dossier)}/node_modules`),
    '/home/node/.npm',
    ...(config.apercu.pip.length ? ['/opt/venv', `${MAISON_PYTHON}/.cache/pip`] : []),
  ];
  const utilisateur = imageNode(config) ? 'node' : 'ada';
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    // Image sans utilisateur « node » (Python…) : on crée « ada », numéro 1000, comme « node ».
    ...(imageNode(config) ? [] : ['id -u ada >/dev/null 2>&1 || useradd --create-home --uid 1000 --shell /bin/bash ada']),
    // Les commandes de l'assistant passent par un shell de connexion (bash -l), qui refait le PATH :
    // l'environnement virtuel Python y est déclaré, sinon pytest, ruff… sont introuvables.
    ...(config.apercu.pip.length
      ? [`printf 'export VIRTUAL_ENV=/opt/venv\\nexport PATH=/opt/venv/bin:$PATH\\n' > /etc/profile.d/ada-venv.sh`]
      : []),
    `mkdir -p ${volumes.join(' ')}`,
    `chown ${utilisateur}:${utilisateur} ${volumes.join(' ')}`,
    `exec runuser -u ${utilisateur} -- bash /travail.sh`,
    '',
  ].join('\n');
}

/** Installation (avec nouvelles tentatives sur connexion lente), préalables, arrière-plan, page affichée. */
export function genererScriptTravail(config: AdaConfig = ADA_PAR_DEFAUT): string {
  const { apercu } = config;
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'installer() {',
    '  for essai in 1 2 3; do',
    '    npm install --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 \\',
    '      --fetch-retry-maxtimeout=180000 --fetch-timeout=600000 && return 0',
    '    echo "[apercu] installation interrompue (essai $essai), nouvelle tentative"',
    '    sleep 10',
    '  done',
    '  return 1',
    '}',
    ...apercu.npm.flatMap((dossier) => [`echo "[apercu] installation : ${dossier}"`, `(cd ${cheminDossier(dossier)} && installer)`]),
    ...(apercu.pip.length
      ? [
          'installer_python() {',
          '  for essai in 1 2 3; do',
          // Outils de test et de lint compris (requirements-dev.txt inclut requirements.txt) : l'assistant
          // lance ses contrôles dans l'aperçu.
          '    fichier=requirements.txt; [ -f requirements-dev.txt ] && fichier=requirements-dev.txt',
          '    pip install --retries 5 --timeout 60 -r "$fichier" && return 0',
          '    echo "[apercu] installation Python interrompue (essai $essai), nouvelle tentative"',
          '    sleep 10',
          '  done',
          '  return 1',
          '}',
          '[ -x /opt/venv/bin/python ] || python3 -m venv /opt/venv',
          ...apercu.pip.flatMap((dossier) => [`echo "[apercu] installation Python : ${dossier}"`, `(cd ${cheminDossier(dossier)} && installer_python)`]),
        ]
      : []),
    ...apercu.avant,
    ...apercu.arrierePlan.map((commande, index) => `(${commande}) > /tmp/arriere-plan-${index}.log 2>&1 &`),
    'echo "[apercu] demarrage"',
    `exec bash -c ${JSON.stringify(apercu.principal)}`,
    '',
  ].join('\n');
}

export type EtatApercu = 'arrete' | 'demarrage' | 'pret' | 'erreur';

/** Déduit l'état à partir de `docker compose ps --format json` (une ligne JSON par conteneur). */
export function etatDepuisPs(sortie: string, repond: boolean): EtatApercu {
  const conteneurs = sortie
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { Service?: string; State?: string });
  const app = conteneurs.find((c) => c.Service === 'app');
  if (!app) return 'arrete';
  if (app.State === 'running') return repond ? 'pret' : 'demarrage';
  if (app.State === 'created' || app.State === 'restarting') return 'demarrage';
  return 'erreur';
}

/**
 * Adresse publique d'un lien de démonstration, d'après le modèle `URL_DEMO` : `{projet}` et
 * `{port}` y sont remplacés (ex. https://{projet}.demo.ada.gouv.fr, ou http://localhost:{port}).
 */
export function adresseDemo(modele: string, projet: string, port: number): string {
  return modele.replaceAll('{projet}', projet).replaceAll('{port}', String(port));
}
