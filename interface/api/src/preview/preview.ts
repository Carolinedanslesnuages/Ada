import { DEFAULT_ADA, type AdaConfig } from '../ada/ada-config.js';
import { technicalName } from '../projects/repository.js';

/** Files and rules of a project preview: pure functions, tested without Docker. */

export const PORT_MIN = 5300;
export const PORT_MAX = 5399;
/** Demo links: another range, so as never to confuse demo and working preview. */
export const DEMO_RANGE = { min: 5400, max: 5499 };
export { REPOSITORY_NAME } from '../projects/repository.js';

/** npm cache shared by every preview (created once): only the first downloads are slow. */
export const NPM_CACHE_VOLUME = 'atelier-po-cache-npm';
/** pip cache shared by the Python previews (created once). */
export const PIP_CACHE_VOLUME = 'atelier-po-cache-pip';

/**
 * Node added to the images that lack it (Python + Vue): pinned version, official fingerprints
 * (nodejs.org/dist/v24.11.0/SHASUMS256.txt) checked, downloaded once into a shared volume.
 */
export const NODE_VERSION = '24.11.0';
export const NODE_FINGERPRINTS: Record<string, string> = {
  x64: 'b3c071cdf47aab867c3b2aa287257df12ec5d7c962bf922b32fd33226c4295fd',
  arm64: '4786d00c4d259d3ff0b2328307f764ef3ced65f2d6e9502d433e68d66238509d',
};
export const NODE_VOLUME = `atelier-po-node-${NODE_VERSION}`;

/** Volumes shared between previews, to create before the first start. */
export const sharedVolumes = (config: AdaConfig): string[] => [
  NPM_CACHE_VOLUME,
  ...(config.preview.pip.length ? [PIP_CACHE_VOLUME] : []),
  ...(nodeAdded(config) ? [NODE_VOLUME] : []),
];

/**
 * Node images have the “node” user (1000); the others (Python…) get “ada”, with
 * the same number 1000: the assistant works in any preview with `-u 1000`.
 */
const nodeImage = (config: AdaConfig) => config.preview.image.startsWith('node:');
const PYTHON_HOME = '/home/ada';
/** Image without Node (Python…) but with npm dependencies (a Vue front): ADA adds Node to it. */
export const nodeAdded = (config: AdaConfig) => !nodeImage(config) && config.preview.npm.length > 0;

/** Download of Node by Python (present in the image), fingerprint checked before extraction. */
const nodeInstallation = () => {
  const footprints = JSON.stringify(NODE_FINGERPRINTS);
  return [
    'if [ ! -x /opt/node/bin/node ]; then',
    `  echo "[apercu] installation de Node ${NODE_VERSION}"`,
    "  python3 - <<'PYTHON'",
    'import hashlib, json, platform, shutil, tarfile, urllib.request',
    `empreintes = json.loads('${footprints}')`,
    "architecture = {'x86_64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64'}[platform.machine()]",
    `nom = f'node-v${NODE_VERSION}-linux-{architecture}'`,
    `contenu = urllib.request.urlopen(f'https://nodejs.org/dist/v${NODE_VERSION}/{nom}.tar.gz', timeout=600).read()`,
    "if hashlib.sha256(contenu).hexdigest() != empreintes[architecture]:",
    "    raise SystemExit('Empreinte de Node invalide : installation refusée')",
    "open('/tmp/node.tar.gz', 'wb').write(contenu)",
    "with tarfile.open('/tmp/node.tar.gz') as archive:",
    "    archive.extractall('/tmp', filter='data')",
    "shutil.copytree(f'/tmp/{nom}', '/opt/node', symlinks=True, dirs_exist_ok=True)",
    'PYTHON',
    'fi',
  ];
};

/** First free port of the range, or the one already assigned to the project. */
export function assignPort(
  project: string,
  assigned: Record<string, number>,
  range: { min: number; max: number } = { min: PORT_MIN, max: PORT_MAX },
): number {
  if (assigned[project]) return assigned[project];
  const taken = new Set(Object.values(assigned));
  for (let port = range.min; port <= range.max; port++) if (!taken.has(port)) return port;
  throw new Error('Plus aucun port libre pour un aperçu : arrêtez des aperçus inutilisés');
}

const folderPath = (folder: string) => (folder === '.' ? '/app' : `/app/${folder.replace(/^\.\//, '')}`);

/**
 * Containers of the preview, according to ada.json: the application, plus PostgreSQL if the template
 * needs it. Limited in memory and CPU; dependencies in volumes (Linux binaries).
 */
export function generateCompose(
  project: string,
  port: number,
  config: AdaConfig = DEFAULT_ADA,
  options: { name?: string; allowedHosts?: string[] } = {},
): string {
  const { preview } = config;
  const hosts = (options.allowedHosts ?? []).filter((host) => /^[a-z0-9.-]+$/i.test(host));
  const moduleVolumes = preview.npm.map((folder, index) => `      - modules_${index}:${folderPath(folder)}/node_modules`);
  const base = preview.database === 'postgres';
  const lines = [
    `name: ${technicalName(options.name ?? `apercu-${project}`)}`,
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
    `    image: ${preview.image}`,
    '    working_dir: /app',
    '    environment:',
    ...(base ? ['      DATABASE_URL: postgresql://apercu:apercu@db:5432/apercu?schema=public'] : []),
    '      NODE_ENV: development',
    ...(preview.pip.length || nodeAdded(config)
      ? [`      PATH: ${[...(preview.pip.length ? ['/opt/venv/bin'] : []), ...(nodeAdded(config) ? ['/opt/node/bin'] : []), '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'].join(':')}`]
      : []),
    // Shared npm cache, at the same place whatever the user (node or ada).
    ...(nodeAdded(config) ? ['      npm_config_cache: /home/node/.npm'] : []),
    ...(preview.pip.length
      ? [
          '      VIRTUAL_ENV: /opt/venv',
          '      PIP_DISABLE_PIP_VERSION_CHECK: "1"',
          '      PYTHONDONTWRITEBYTECODE: "1"',
          '      PYTHONUNBUFFERED: "1"',
        ]
      : []),
    // Public address (demo link): otherwise Vite's server refuses another host.
    ...(hosts.length ? [`      __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: ${hosts.join(',')}`] : []),
    '    volumes:',
    '      - ./depot:/app',
    '      - ./demarrer.sh:/demarrer.sh:ro',
    '      - ./travail.sh:/travail.sh:ro',
    ...moduleVolumes,
    '      - cache_npm:/home/node/.npm',
    ...(preview.pip.length ? ['      - venv:/opt/venv', `      - cache_pip:${PYTHON_HOME}/.cache/pip`] : []),
    ...(nodeAdded(config) ? ['      - node:/opt/node'] : []),
    '    command: ["bash", "/demarrer.sh"]',
    '    ports:',
    `      - "127.0.0.1:${port}:${preview.port}"`,
    ...(base ? ['    depends_on:', '      db:', '        condition: service_healthy'] : []),
    '    mem_limit: 1536m',
    '    cpus: 1',
    'volumes:',
    ...(base ? ['  donnees: {}'] : []),
    ...preview.npm.map((_, index) => `  modules_${index}: {}`),
    '  cache_npm:',
    `    name: ${NPM_CACHE_VOLUME}`,
    '    external: true',
    ...(preview.pip.length ? ['  venv: {}', '  cache_pip:', `    name: ${PIP_CACHE_VOLUME}`, '    external: true'] : []),
    ...(nodeAdded(config) ? ['  node:', `    name: ${NODE_VOLUME}`, '    external: true'] : []),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Run as root only to give the volumes to the “node” user (Node images), then
 * travail.sh runs as “node”. npm install (and not npm ci): npm ci would try to delete the mount
 * point.
 */
export function generateStartScript(config: AdaConfig = DEFAULT_ADA): string {
  const volumes = [
    ...config.preview.npm.map((folder) => `${folderPath(folder)}/node_modules`),
    '/home/node/.npm',
    ...(config.preview.pip.length ? ['/opt/venv', `${PYTHON_HOME}/.cache/pip`] : []),
  ];
  const user = nodeImage(config) ? 'node' : 'ada';
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    // Image without a “node” user (Python…): “ada” is created, number 1000, like “node”.
    ...(nodeImage(config) ? [] : ['id -u ada >/dev/null 2>&1 || useradd --create-home --uid 1000 --shell /bin/bash ada']),
    // The assistant's commands go through a login shell (bash -l), which rebuilds the PATH:
    // the Python virtual environment is declared there, otherwise pytest, ruff… cannot be found.
    ...(config.preview.pip.length
      ? [`printf 'export VIRTUAL_ENV=/opt/venv\\nexport PATH=/opt/venv/bin:$PATH\\n' > /etc/profile.d/ada-venv.sh`]
      : []),
    ...(nodeAdded(config)
      ? [...nodeInstallation(), `printf 'export PATH=/opt/node/bin:$PATH\\nexport npm_config_cache=/home/node/.npm\\n' > /etc/profile.d/ada-node.sh`]
      : []),
    `mkdir -p ${volumes.join(' ')}`,
    `chown ${user}:${user} ${volumes.join(' ')}`,
    `exec runuser -u ${user} -- bash /travail.sh`,
    '',
  ].join('\n');
}

/**
 * Installation in a folder declared by ada.json. A missing folder (e.g. a package name put
 * by mistake instead of a folder) is reported and ignored: it must not stop the whole preview.
 */
const installInto = (folder: string, func: string, label: string): string[] => [
  `echo "[apercu] installation${label} : ${folder}"`,
  `if [ -d ${folderPath(folder)} ]; then (cd ${folderPath(folder)} && ${func}); else echo "[apercu] dossier ${folder} absent : installation ignorée (à corriger dans ada.json, qui attend des dossiers)"; fi`,
];

/** Installation (with retries on a slow connection), preliminaries, background, displayed page. */
export function generateWorkScript(config: AdaConfig = DEFAULT_ADA): string {
  const { preview } = config;
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
    ...preview.npm.flatMap((folder) => installInto(folder, 'installer', '')),
    ...(preview.pip.length
      ? [
          'installer_python() {',
          '  for essai in 1 2 3; do',
          // Test and lint tools included (requirements-dev.txt includes requirements.txt): the assistant
          // runs its checks in the preview.
          '    fichier=requirements.txt; [ -f requirements-dev.txt ] && fichier=requirements-dev.txt',
          '    pip install --retries 5 --timeout 60 -r "$fichier" && return 0',
          '    echo "[apercu] installation Python interrompue (essai $essai), nouvelle tentative"',
          '    sleep 10',
          '  done',
          '  return 1',
          '}',
          '[ -x /opt/venv/bin/python ] || python3 -m venv /opt/venv',
          ...preview.pip.flatMap((folder) => installInto(folder, 'installer_python', ' Python')),
        ]
      : []),
    ...preview.before,
    ...preview.background.map((command, index) => `(${command}) > /tmp/arriere-plan-${index}.log 2>&1 &`),
    'echo "[apercu] demarrage"',
    `exec bash -c ${JSON.stringify(preview.main)}`,
    '',
  ].join('\n');
}

export type PreviewState = 'stopped' | 'starting' | 'ready' | 'error';

/** Deduces the state from `docker compose ps --format json` (one JSON line per container). */
export function stateFromPs(output: string, responds: boolean): PreviewState {
  const containers = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { Service?: string; State?: string });
  const app = containers.find((c) => c.Service === 'app');
  if (!app) return 'stopped';
  if (app.State === 'running') return responds ? 'ready' : 'starting';
  if (app.State === 'created' || app.State === 'restarting') return 'starting';
  return 'error';
}

/**
 * Public address of a demo link, according to the `DEMO_URL` pattern: `{projet}` and
 * `{port}` are replaced in it (e.g. https://{projet}.demo.ada.gouv.fr, or http://localhost:{port}).
 */
export function demoAddress(template: string, project: string, port: number): string {
  return template.replaceAll(/\{projec?t\}/g, technicalName(project)).replaceAll('{port}', String(port));
}
