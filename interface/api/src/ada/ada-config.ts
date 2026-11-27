import { z } from 'zod';
import { fromLegacyAdaJson } from './legacy-ada-json.js';

/**
 * Description of a project template (`ada.json` file at the root of the repository): its type, how
 * to start it in the preview, which files to customize, which checks to require. ADA thus adapts
 * to any stack without assuming “front + NestJS API + PostgreSQL”.
 */
export const PROJECT_TYPES = [
  'service',
  'form',
  'dashboard',
  'management',
  'site',
  'documentation',
  'map',
  'mobile',
  'training',
  'extension',
  'component',
  'api',
  'processing',
  'mockup',
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

/**
 * `ada.json` comes from the PO's repository, which the agent (or an adopted repository) can modify:
 * its values end up in `compose.yml` and in shell scripts. The fields that enter them as
 * structure (image, folders) are therefore limited to a safe shape: no space or line break,
 * no “..”, no absolute path.
 */
const IMAGE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*(:[A-Za-z0-9][A-Za-z0-9._-]{0,127})?$/;
const FOLDER = /^(\.|(\.\/)?[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*)$/;
const folder = z.string().max(200).regex(FOLDER, 'un dossier du projet (api, front, . …), sans « .. » ni chemin absolu');

const schema = z.object({
  type: z.enum(PROJECT_TYPES),
  /** Files containing the markers __NOM_PROJET__, __BASELINE__… to replace at creation. */
  customize: z.array(z.string()).default([]),
  /** Names of the CI jobs required before merging (protection of main, “Approve and merge” button). */
  requiredChecks: z.array(z.string()).min(1),
  /** Commands of the final check, run in the preview container (one per part of the project). */
  checks: z.array(z.string()).min(1),
  /**
   * Appearance: DSFR (State projects created by ADA), or the project's own (adopted project that
   * does not use it); the assistant then does not introduce the DSFR.
   */
  dsfr: z.boolean().default(true),
  /** Deployable template: folder of the Helm chart, added to the project only if the PO asks for it. */
  deployment: z.object({ chart: z.string().min(1) }).nullable().default(null),
  preview: z.object({
    image: z.string().max(200).regex(IMAGE, 'une image Docker (nom:version), sans espace ni retour à la ligne').default('node:24-bookworm'),
    /** Database of the preview: PostgreSQL, or none. */
    database: z.enum(['postgres']).nullable().default(null),
    /** Folders where “npm install” runs (with retries), “.” for the root. */
    npm: z.array(folder).default([]),
    /**
     * Folders containing a requirements.txt (Python): installed in a virtual environment
     * (/opt/venv, kept in a volume), with retries.
     */
    pip: z.array(folder).default([]),
    /** Preliminary commands (migrations, pip install…). */
    before: z.array(z.string()).default([]),
    /** Commands started in the background (e.g. the API). */
    background: z.array(z.string()).default([]),
    /** Main command, in the foreground, which serves the page displayed in the preview. */
    main: z.string(),
    port: z.number().int().positive().default(5173),
  }),
});

export type AdaConfig = z.output<typeof schema>;

/** Behaviour of the projects created before ada.json (Vue + NestJS + PostgreSQL template). */
export const DEFAULT_ADA: AdaConfig = {
  type: 'service',
  dsfr: true,
  deployment: null,
  customize: [
    'PROJET.md',
    'README.md',
    'AGENTS.md',
    'api/README.md',
    'docker-compose.yml',
    'docs/adr/0001-choix-de-la-stack.md',
    'docs/adr/README.md',
    'front/index.html',
    'front/src/App.vue',
    'front/src/views/HomeView.vue',
    'front/src/views/__tests__/HomeView.spec.ts',
  ],
  requiredChecks: [
    'Anti-fuite (gitleaks) / Scan git history for leaked secrets',
    'Commits (Conventional Commits) / Lint commit messages',
    'Workflows (zizmor) / Audit workflows with zizmor',
    'Configuration (Trivy) / Scan config files vulnerabilities',
    'API (lint, tests, compilation)',
    'Front (lint, types, tests dont accessibilité, compilation)',
  ],
  checks: [
    'cd /app/api && npm run lint && npm test && npm run test:e2e && npm run build',
    'cd /app/front && npx oxlint . && npx eslint . && npm run type-check && npm run test:unit -- --run && npm run build-only',
  ],
  preview: {
    image: 'node:24-bookworm',
    database: 'postgres',
    pip: [],
    npm: ['api', 'front'],
    before: ['cd /app/api && if [ -d prisma/migrations ]; then npx prisma migrate deploy; fi'],
    background: ['cd /app/api && npm run start:dev'],
    main: 'cd /app/front && npx vite --host 0.0.0.0 --port 5173 --strictPort',
    port: 5173,
  },
};

/** Reads an ada.json; missing → default behaviour; invalid → explicit error. */
export function readAdaConfig(content: string | null): AdaConfig {
  if (content === null) return DEFAULT_ADA;
  const result = schema.safeParse(fromLegacyAdaJson(JSON.parse(content)));
  if (!result.success) {
    throw new Error(`ada.json invalide : ${result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join(' ; ')}`);
  }
  return result.data;
}
