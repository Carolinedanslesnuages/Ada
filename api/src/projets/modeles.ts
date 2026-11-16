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

/** Labels posés à la création d'un projet : types de demande et statuts gérés par l'atelier. */
export const LABELS_ATELIER = [
  { name: 'user-story', color: '000091', description: 'Story écrite par le PO' },
  { name: 'bug', color: 'ce0500', description: 'Problème signalé par le PO' },
  { name: 'story:en-cours', color: '0063cb', description: 'Lancée depuis l’atelier PO' },
  { name: 'story:questions', color: 'b34000', description: 'L’assistant attend des réponses du PO' },
  { name: 'story:plan-a-valider', color: 'b34000', description: 'Le PO doit valider le plan' },
  { name: 'story:en-verification', color: '0063cb', description: 'Réalisée, contrôles en cours' },
  { name: 'story:besoin-dev', color: 'ce0500', description: 'Bloquée : un développeur doit intervenir' },
];
