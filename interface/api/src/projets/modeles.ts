import type { TypeProjet } from '../ada/ada-config.js';

/** Les types de projet proposés au PO, dans l'ordre d'affichage. */
export const TYPES: { id: TypeProjet; libelle: string; description: string }[] = [
  { id: 'service', libelle: 'Service en ligne', description: 'Une application avec des données et plusieurs écrans' },
  { id: 'formulaire', libelle: 'Formulaire', description: 'Recueillir des informations : inscription, demande, enquête' },
  { id: 'extension', libelle: 'Extension de navigateur', description: 'Un outil dans Chrome, Firefox ou Edge' },
  { id: 'maquette', libelle: 'Maquette', description: 'Montrer un parcours avant de le développer, sans serveur' },
];

export interface Modele {
  id: string;
  type: TypeProjet;
  libelle: string;
  pourQuoi: string;
  /** Vrai dès que le dossier `catalogue/<id>/` d'ADA contient le modèle (avec son ada.json). */
  disponible: boolean;
}

/**
 * Tous les modèles prévus. Ils vivent dans le dépôt d'ADA (`catalogue/<id>/`), pas dans des dépôts
 * modèles GitHub : un modèle est disponible dès que son dossier est livré (voir docs/adr).
 */
export function catalogue(): Omit<Modele, 'disponible'>[] {
  return [
    {
      id: 'vue-nest-dsfr',
      type: 'service',
      libelle: 'Vue 3 + NestJS + PostgreSQL, avec DSFR',
      pourQuoi: 'Application métier structurée, nombreuses règles, durée de vie longue',
    },
    { id: 'vue-node', type: 'service', libelle: 'Vue 3 + Node.js (Express), avec DSFR', pourQuoi: 'Petite application ou API simple' },
    { id: 'vue-fastapi', type: 'service', libelle: 'Vue 3 + Python (FastAPI) + PostgreSQL', pourQuoi: 'Données, calculs, IA, import/export de fichiers' },
    { id: 'django', type: 'service', libelle: 'Python (Django)', pourQuoi: 'Back-office, formulaires, administration des données' },
    { id: 'nuxt', type: 'service', libelle: 'Nuxt', pourQuoi: 'Site public bien référencé (SEO)' },
    { id: 'formulaire', type: 'formulaire', libelle: 'Formulaire DSFR', pourQuoi: 'Réponses enregistrées dans le projet, page « Réponses » et export CSV' },
    { id: 'extension', type: 'extension', libelle: 'Extension de navigateur (Vue)', pourQuoi: 'Chrome, Firefox, Edge ; sans identité de l’État' },
    { id: 'maquette', type: 'maquette', libelle: 'Maquette Vue 3, avec DSFR', pourQuoi: 'Parcours cliquable, données fictives, aucun serveur' },
  ];
}

/** Labels posés à la création d'un projet : types de demande et statuts gérés par l'atelier. */
export const LABELS_ATELIER = [
  { name: 'user-story', color: '000091', description: 'Story écrite par le PO' },
  { name: 'bug', color: 'ce0500', description: 'Problème signalé par le PO' },
  { name: 'story:en-cours', color: '0063cb', description: 'Lancée depuis ADA' },
  { name: 'story:questions', color: 'b34000', description: 'L’assistant attend des réponses du PO' },
  { name: 'story:plan-a-valider', color: 'b34000', description: 'Le PO doit valider le plan' },
  { name: 'story:en-verification', color: '0063cb', description: 'Réalisée, contrôles en cours' },
  { name: 'story:besoin-dev', color: 'ce0500', description: 'Bloquée : un développeur doit intervenir' },
];
