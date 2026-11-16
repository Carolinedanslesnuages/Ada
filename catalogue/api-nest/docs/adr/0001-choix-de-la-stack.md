# ADR-0001 — Choix de la stack : API NestJS + PostgreSQL

- **Statut** : Accepted
- **Date** : __DATE__
- **Décideurs** : __PO__, via ADA
- **Sujet** : stack technique du projet __NOM_PROJET__

## Contexte
__OBJECTIF__ Le projet démarre comme POC réalisé par un PO avec un assistant de code ; seules
les stacks de l'atelier sont autorisées. Le besoin est une API, sans écran.

## Options considérées
### Option A — NestJS + PostgreSQL, documentation OpenAPI
- Structure (modules, injection), validation des entrées, documentation générée à partir du code.
### Option B — Python (FastAPI) + PostgreSQL
- Adapté aux calculs et à la donnée.
- **Pourquoi pas** : la stack de référence de l'équipe est NestJS.

## Décision
**Option retenue : A** — choix du PO, conforme aux consignes de l'équipe technique.

## Conséquences
- **Positives** : conventions, tests, documentation OpenAPI et CI d'ADA disponibles d'emblée.
- **Négatives** : nécessite PostgreSQL (Docker en développement).
- **À surveiller** : un besoin hors du périmètre de la stack = nouvelle ADR.

## Suivi
- [x] Implémentation : création du projet depuis ADA
