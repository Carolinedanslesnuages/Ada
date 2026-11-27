import type { ProjectType } from '../ada/ada-config.js';

/** Project families, in the display order of “What do you want to create?”. */
export const FAMILIES = [
  { id: 'service', label: 'Un service pour les usagers ou les agents' },
  { id: 'existing-tool', label: 'Dans un outil déjà utilisé' },
  { id: 'no-screen', label: 'Sans écran : données et automatisation' },
  { id: 'idea', label: 'Pour montrer une idée' },
] as const;

export type Family = (typeof FAMILIES)[number]['id'];

/** Every imaginable project type; only those with a shipped template can be selected. */
export const TYPES: { id: ProjectType; family: Family; label: string; description: string }[] = [
  { id: 'service', family: 'service', label: 'Application en ligne', description: 'Des données, plusieurs écrans, des règles métier : réservation, suivi, inventaire…' },
  { id: 'form', family: 'service', label: 'Formulaire ou démarche', description: 'Recueillir des informations (inscription, demande, enquête) et consulter les réponses' },
  { id: 'dashboard', family: 'service', label: 'Tableau de bord', description: 'Indicateurs, graphiques et tableaux pour suivre une activité' },
  { id: 'management', family: 'service', label: 'Outil de gestion (back-office)', description: 'Administrer des données : listes, fiches, recherche, validation' },
  { id: 'site', family: 'service', label: 'Site d’information', description: 'Pages publiques, actualités, bien référencées par les moteurs de recherche' },
  { id: 'documentation', family: 'service', label: 'Guide ou documentation', description: 'Pages de documentation avec sommaire et recherche' },
  { id: 'map', family: 'service', label: 'Carte interactive', description: 'Des lieux, équipements ou zones sur une carte, avec filtres' },
  { id: 'mobile', family: 'service', label: 'Application mobile', description: 'Installable sur téléphone depuis le navigateur, utilisable hors connexion' },
  { id: 'training', family: 'service', label: 'Formation ou quiz', description: 'Apprendre, s’entraîner, s’auto-évaluer' },
  { id: 'extension', family: 'existing-tool', label: 'Extension de navigateur', description: 'Un outil dans Chrome, Firefox ou Edge' },
  { id: 'component', family: 'existing-tool', label: 'Composant à intégrer', description: 'Un bloc à insérer dans un autre site : simulateur, calculette, recherche' },
  { id: 'api', family: 'no-screen', label: 'API', description: 'Mettre des données ou un calcul à disposition d’autres services' },
  { id: 'processing', family: 'no-screen', label: 'Traitement de données', description: 'Importer, nettoyer, convertir des fichiers ; tâche planifiée' },
  { id: 'mockup', family: 'idea', label: 'Maquette cliquable', description: 'Montrer un parcours avant de le développer : données fictives, aucun serveur' },
];

export interface Template {
  id: string;
  type: ProjectType;
  label: string;
  purpose: string;
  /** True as soon as ADA's `catalogue/<id>/` folder contains the template (with its ada.json). */
  available: boolean;
  /** The template can be deployed (Dockerfile and Helm chart): the creation offers to add it. */
  deployable: boolean;
}

/**
 * Every planned stack, by type. They live in ADA's repository (`catalogue/<id>/`), not
 * in GitHub template repositories: a stack is available as soon as its folder is shipped.
 * Vue 3 + NestJS first; Python when the need calls for it (data, AI, back office).
 */
export function catalog(): Omit<Template, 'available' | 'deployable'>[] {
  return [
    { id: 'vue-nest-dsfr', type: 'service', label: 'Vue 3 + NestJS + PostgreSQL, avec DSFR', purpose: 'Application métier structurée, nombreuses règles, durée de vie longue' },
    { id: 'vue-node', type: 'service', label: 'Vue 3 + Node.js (Express), avec DSFR', purpose: 'Petite application, peu de règles' },
    { id: 'vue-node-sans-dsfr', type: 'service', label: 'Vue 3 + Node.js (Express), sans DSFR', purpose: 'Petite application hors identité de l’État : apparence libre, toujours accessible' },
    { id: 'vue-fastapi', type: 'service', label: 'Vue 3 + Python (FastAPI) + PostgreSQL, avec DSFR', purpose: 'Données, calculs, IA, import/export de fichiers' },
    { id: 'formulaire', type: 'form', label: 'Formulaire DSFR (Vue 3 + Node.js)', purpose: 'Réponses enregistrées dans le projet, page « Réponses » et export CSV' },
    { id: 'tableau-de-bord', type: 'dashboard', label: 'Vue 3 + NestJS, graphiques DSFR', purpose: 'Indicateurs calculés côté serveur, graphiques accessibles' },
    { id: 'django', type: 'management', label: 'Python (Django), administration intégrée', purpose: 'Listes, fiches et droits prêts à l’emploi' },
    { id: 'nuxt', type: 'site', label: 'Nuxt, avec DSFR', purpose: 'Pages générées pour un bon référencement (SEO), déclaration d’accessibilité incluse' },
    { id: 'vitepress', type: 'documentation', label: 'VitePress, aux couleurs de l’État', purpose: 'Pages écrites en Markdown, recherche intégrée, accessibilité de chaque page vérifiée' },
    { id: 'carte', type: 'map', label: 'Vue 3 + MapLibre, avec DSFR', purpose: 'Fonds de carte IGN, données GeoJSON' },
    { id: 'pwa', type: 'mobile', label: 'Vue 3 installable (PWA), avec DSFR', purpose: 'Une seule application pour téléphone et ordinateur' },
    { id: 'quiz', type: 'training', label: 'Vue 3, avec DSFR, sans serveur', purpose: 'Questions et parcours décrits dans des fichiers' },
    { id: 'extension', type: 'extension', label: 'Extension de navigateur (Vue)', purpose: 'Chrome, Firefox, Edge ; sans identité de l’État' },
    { id: 'composant', type: 'component', label: 'Composant web (Vue)', purpose: 'Une balise à coller dans n’importe quelle page' },
    { id: 'api-nest', type: 'api', label: 'NestJS + PostgreSQL, documentation OpenAPI', purpose: 'API documentée et testée' },
    { id: 'api-fastapi', type: 'api', label: 'Python (FastAPI) + PostgreSQL', purpose: 'Calculs, données, IA' },
    { id: 'traitement-python', type: 'processing', label: 'Python (scripts planifiés)', purpose: 'Fichiers CSV nettoyés et contrôlés, rapport lisible ; exécution planifiée par la CI' },
    { id: 'maquette', type: 'mockup', label: 'Maquette Vue 3, avec DSFR', purpose: 'Parcours cliquable, données fictives, aucun serveur' },
  ];
}

/** Labels set at project creation: request types and statuses managed by the workshop. */
export const WORKSHOP_LABELS = [
  { name: 'user-story', color: '000091', description: 'Story écrite par le PO' },
  { name: 'mode-libre', color: '6a6af4', description: 'Demande libre du PO (mode sauvage, hors story)' },
  { name: 'mode-conversation', color: '6a6af4', description: 'Conversation libre du PO avec ADA' },
  { name: 'bug', color: 'ce0500', description: 'Problème signalé par le PO' },
  { name: 'story:en-cours', color: '0063cb', description: 'Lancée depuis ADA' },
  { name: 'story:questions', color: 'b34000', description: 'ADA attend des réponses du PO' },
  { name: 'story:plan-a-valider', color: 'b34000', description: 'Le PO doit valider le plan' },
  { name: 'story:en-verification', color: '0063cb', description: 'Réalisée, contrôles en cours' },
  { name: 'story:besoin-dev', color: 'ce0500', description: 'Bloquée : un développeur doit intervenir' },
  { name: 'story:decoupage-a-valider', color: 'b34000', description: 'Le PO choisit les stories du découpage proposé' },
  { name: 'story:parent', color: '6a6af4', description: 'Demande découpée en stories' },
  { name: 'story:conversation', color: 'b34000', description: 'ADA a répondu : au PO d’écrire' },
  { name: 'story:en-attente', color: '929292', description: 'Rien à construire pour l’instant : à relancer plus tard' },
];
