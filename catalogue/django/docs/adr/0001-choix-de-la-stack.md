# ADR-0001 — Choix de la stack : Django (administration intégrée)

- **Statut** : Accepted
- **Date** : __DATE__
- **Décideurs** : __PO__, via ADA
- **Sujet** : stack technique du projet __NOM_PROJET__

## Contexte
__OBJECTIF__ Le projet démarre comme POC réalisé par un PO avec un assistant de code ; seules
les stacks d'ADA sont autorisées. Il s'agit d'administrer des données : listes, fiches,
recherche, validation, droits.

## Options considérées
### Option A — Python 3.13, Django + PostgreSQL
- L'administration de Django fournit listes, filtres, recherche, fiches, historique et droits
  sans les coder ; chaque donnée est décrite une fois (modèle) et l'écran suit.
### Option B — Vue 3 + NestJS + PostgreSQL
- **Pourquoi pas** : chaque écran de gestion serait à construire ; plus long pour un POC.

## Décision
**Option retenue : A** — choix du PO, conforme aux consignes de l'équipe technique.

## Conséquences
- **Positives** : écrans de gestion immédiats ; migrations générées ; tests et CI d'ADA d'emblée.
- **Négatives** : l'administration de Django n'a pas l'apparence du DSFR ; réservée à des agents
  (back-office), pas au public.
- **À surveiller** : un écran destiné au public = pages dédiées respectant le DSFR (nouvelle ADR).

## Suivi
- [x] Implémentation : création du projet depuis ADA
