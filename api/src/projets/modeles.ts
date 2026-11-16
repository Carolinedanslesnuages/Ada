import type { Config } from '../config.js';

export interface Modele {
  id: string;
  libelle: string;
  pourQuoi: string;
  /** « proprietaire/depot » du dépôt modèle GitHub, ou null si pas encore disponible. */
  depot: string | null;
}

/** Fichiers des modèles qui contiennent des marqueurs à remplacer. */
export const FICHIERS_A_PERSONNALISER = [
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
];

/** Contrôles de la CI des modèles exigés par la protection de main (noms des jobs). */
export const CONTROLES_REQUIS = [
  'Anti-fuite (gitleaks)',
  'API (lint, tests, compilation)',
  'Front (lint, types, tests dont accessibilité, compilation)',
];

export function catalogue(config: Config): Modele[] {
  return [
    {
      id: 'vue-nest-dsfr',
      libelle: 'Vue 3 + NestJS + PostgreSQL, avec DSFR',
      pourQuoi: 'Application métier structurée, nombreuses règles, durée de vie longue',
      depot: config.MODELE_VUE_NEST_DSFR || `${config.GITHUB_PROPRIETAIRE}/modele-vue-nest-dsfr`,
    },
    { id: 'vue-node', libelle: 'Vue 3 + Node.js (Express)', pourQuoi: 'Petite application ou API simple', depot: null },
    { id: 'vue-fastapi', libelle: 'Vue 3 + Python (FastAPI) + PostgreSQL', pourQuoi: 'Données, calculs, IA, import/export de fichiers', depot: null },
    { id: 'django', libelle: 'Python (Django)', pourQuoi: 'Back-office, formulaires, administration des données', depot: null },
    { id: 'nuxt', libelle: 'Nuxt', pourQuoi: 'Site public bien référencé (SEO)', depot: null },
    { id: 'vue-seul', libelle: 'Vue 3 seul', pourQuoi: 'Maquette ou prototype cliquable', depot: null },
  ];
}
