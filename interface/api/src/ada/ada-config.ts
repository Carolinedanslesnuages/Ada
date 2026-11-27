import { z } from 'zod';

/**
 * Description d'un modèle de projet (fichier `ada.json` à la racine du dépôt) : son type, comment
 * le lancer dans l'aperçu, quels fichiers personnaliser, quels contrôles exiger. ADA s'adapte ainsi
 * à n'importe quelle stack sans supposer « front + API NestJS + PostgreSQL ».
 */
export const TYPES_PROJET = [
  'service',
  'formulaire',
  'tableau-de-bord',
  'gestion',
  'site',
  'documentation',
  'carte',
  'mobile',
  'formation',
  'extension',
  'composant',
  'api',
  'traitement',
  'maquette',
] as const;
export type TypeProjet = (typeof TYPES_PROJET)[number];

/**
 * `ada.json` vient du dépôt du PO, que l'agent (ou un dépôt repris) peut modifier : ses valeurs
 * finissent dans `compose.yml` et dans des scripts shell. Les champs qui y entrent comme
 * structure (image, dossiers) sont donc limités à une forme sûre : aucune espace ni retour à la
 * ligne, aucun « .. », aucun chemin absolu.
 */
const IMAGE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*(:[A-Za-z0-9][A-Za-z0-9._-]{0,127})?$/;
const DOSSIER = /^(\.|(\.\/)?[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*)$/;
const dossier = z.string().max(200).regex(DOSSIER, 'un dossier du projet (api, front, . …), sans « .. » ni chemin absolu');

const schema = z.object({
  type: z.enum(TYPES_PROJET),
  /** Fichiers contenant les marqueurs __NOM_PROJET__, __BASELINE__… à remplacer à la création. */
  personnaliser: z.array(z.string()).default([]),
  /** Noms des jobs de CI exigés avant fusion (protection de main, bouton « Valider et fusionner »). */
  controlesRequis: z.array(z.string()).min(1),
  /** Commandes du contrôle final, exécutées dans le conteneur de l'aperçu (une par partie du projet). */
  controles: z.array(z.string()).min(1),
  /**
   * Apparence : DSFR (projets de l'État créés par ADA), ou celle du projet (projet repris qui ne
   * l'utilise pas) ; l'assistant n'introduit alors pas le DSFR.
   */
  dsfr: z.boolean().default(true),
  /** Modèle déployable : dossier du chart Helm, ajouté au projet seulement si le PO le demande. */
  deploiement: z.object({ chart: z.string().min(1) }).nullable().default(null),
  apercu: z.object({
    image: z.string().max(200).regex(IMAGE, 'une image Docker (nom:version), sans espace ni retour à la ligne').default('node:24-bookworm'),
    /** Base de données de l'aperçu : PostgreSQL, ou aucune. */
    base: z.enum(['postgres']).nullable().default(null),
    /** Dossiers où lancer « npm install » (avec nouvelles tentatives), « . » pour la racine. */
    npm: z.array(dossier).default([]),
    /**
     * Dossiers contenant un requirements.txt (Python) : installés dans un environnement virtuel
     * (/opt/venv, conservé dans un volume), avec nouvelles tentatives.
     */
    pip: z.array(dossier).default([]),
    /** Commandes préalables (migrations, pip install…). */
    avant: z.array(z.string()).default([]),
    /** Commandes lancées en arrière-plan (ex. l'API). */
    arrierePlan: z.array(z.string()).default([]),
    /** Commande principale, au premier plan, qui sert la page affichée dans l'aperçu. */
    principal: z.string(),
    port: z.number().int().positive().default(5173),
  }),
});

export type AdaConfig = z.output<typeof schema>;

/** Comportement des projets créés avant ada.json (modèle Vue + NestJS + PostgreSQL). */
export const ADA_PAR_DEFAUT: AdaConfig = {
  type: 'service',
  dsfr: true,
  deploiement: null,
  personnaliser: [
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
  controlesRequis: [
    'Anti-fuite (gitleaks) / Scan git history for leaked secrets',
    'Commits (Conventional Commits) / Lint commit messages',
    'Workflows (zizmor) / Audit workflows with zizmor',
    'Configuration (Trivy) / Scan config files vulnerabilities',
    'API (lint, tests, compilation)',
    'Front (lint, types, tests dont accessibilité, compilation)',
  ],
  controles: [
    'cd /app/api && npm run lint && npm test && npm run test:e2e && npm run build',
    'cd /app/front && npx oxlint . && npx eslint . && npm run type-check && npm run test:unit -- --run && npm run build-only',
  ],
  apercu: {
    image: 'node:24-bookworm',
    base: 'postgres',
    pip: [],
    npm: ['api', 'front'],
    avant: ['cd /app/api && if [ -d prisma/migrations ]; then npx prisma migrate deploy; fi'],
    arrierePlan: ['cd /app/api && npm run start:dev'],
    principal: 'cd /app/front && npx vite --host 0.0.0.0 --port 5173 --strictPort',
    port: 5173,
  },
};

/** Lit un ada.json ; absent → comportement par défaut ; invalide → erreur explicite. */
export function lireAdaConfig(contenu: string | null): AdaConfig {
  if (contenu === null) return ADA_PAR_DEFAUT;
  const resultat = schema.safeParse(JSON.parse(contenu));
  if (!resultat.success) {
    throw new Error(`ada.json invalide : ${resultat.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}`);
  }
  return resultat.data;
}
