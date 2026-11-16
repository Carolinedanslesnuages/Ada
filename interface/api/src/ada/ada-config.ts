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
  'assistant',
  'formation',
  'extension',
  'composant',
  'robot',
  'connecteur',
  'api',
  'traitement',
  'documents',
  'maquette',
] as const;
export type TypeProjet = (typeof TYPES_PROJET)[number];

const schema = z.object({
  type: z.enum(TYPES_PROJET),
  /** Fichiers contenant les marqueurs __NOM_PROJET__, __BASELINE__… à remplacer à la création. */
  personnaliser: z.array(z.string()).default([]),
  /** Noms des jobs de CI exigés avant fusion (protection de main, bouton « Valider et fusionner »). */
  controlesRequis: z.array(z.string()).min(1),
  /** Commandes du contrôle final, exécutées dans le conteneur de l'aperçu (une par partie du projet). */
  controles: z.array(z.string()).min(1),
  apercu: z.object({
    image: z.string().default('node:24-bookworm'),
    /** Base de données de l'aperçu : PostgreSQL, ou aucune. */
    base: z.enum(['postgres']).nullable().default(null),
    /** Dossiers où lancer « npm install » (avec nouvelles tentatives), « . » pour la racine. */
    npm: z.array(z.string()).default([]),
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
    'Anti-fuite (gitleaks)',
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
