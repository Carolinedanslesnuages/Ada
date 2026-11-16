/** Fichiers et règles de l'aperçu d'un projet : fonctions pures, testées sans Docker. */

export const PORT_MIN = 5300;
export const PORT_MAX = 5399;
export const NOM_DEPOT = /^[a-z0-9][a-z0-9._-]{0,99}$/;

/** Cache npm commun à tous les aperçus (créé une fois) : seuls les premiers téléchargements sont lents. */
export const VOLUME_CACHE_NPM = 'atelier-po-cache-npm';

/** Premier port libre de la plage, ou celui déjà attribué au projet. */
export function attribuerPort(projet: string, attribues: Record<string, number>): number {
  if (attribues[projet]) return attribues[projet];
  const pris = new Set(Object.values(attribues));
  for (let port = PORT_MIN; port <= PORT_MAX; port++) if (!pris.has(port)) return port;
  throw new Error('Plus aucun port libre pour un aperçu : arrêtez des aperçus inutilisés');
}

/**
 * Deux conteneurs : PostgreSQL et l'application (API + front en rechargement automatique).
 * Limités en mémoire et processeur ; dépendances dans des volumes (binaires Linux, jamais ceux du poste).
 */
export function genererCompose(projet: string, port: number): string {
  return `name: apercu-${projet}
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: apercu
      POSTGRES_PASSWORD: apercu
      POSTGRES_DB: apercu
    volumes:
      - donnees:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U apercu"]
      interval: 3s
      retries: 20
    mem_limit: 256m
  app:
    image: node:24-bookworm
    working_dir: /app
    environment:
      DATABASE_URL: postgresql://apercu:apercu@db:5432/apercu?schema=public
      NODE_ENV: development
    volumes:
      - ./depot:/app
      - ./demarrer.sh:/demarrer.sh:ro
      - modules_api:/app/api/node_modules
      - modules_front:/app/front/node_modules
      - cache_npm:/home/node/.npm
    command: ["bash", "/demarrer.sh"]
    ports:
      - "127.0.0.1:${port}:5173"
    depends_on:
      db:
        condition: service_healthy
    mem_limit: 1536m
    cpus: 1
volumes:
  donnees: {}
  modules_api: {}
  modules_front: {}
  cache_npm:
    name: atelier-po-cache-npm
    external: true
`;
}

/**
 * Lancé en root uniquement pour donner les volumes à l'utilisateur « node », puis tout tourne
 * en « node ». npm install (et non npm ci) : npm ci voudrait supprimer le point de montage.
 */
export const SCRIPT_DEMARRAGE = `#!/usr/bin/env bash
set -euo pipefail
chown node:node /app/api/node_modules /app/front/node_modules /home/node/.npm
exec runuser -u node -- bash -euo pipefail -c '
  cd /app/api
  echo "[apercu] installation de l API"
  npm install --no-audit --no-fund
  if [ -d prisma/migrations ]; then npx prisma migrate deploy; fi
  (npm run start:dev > /tmp/api.log 2>&1 &)
  cd /app/front
  echo "[apercu] installation du front"
  npm install --no-audit --no-fund
  echo "[apercu] demarrage du front"
  exec npx vite --host 0.0.0.0 --port 5173 --strictPort
'
`;

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
