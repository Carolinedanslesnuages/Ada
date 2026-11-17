# ADR-0001 — Choix de la stack : site Nuxt avec le DSFR, pages générées

- **Statut** : Accepted
- **Date** : __DATE__
- **Décideurs** : __PO__, via ADA
- **Sujet** : stack technique du projet __NOM_PROJET__

## Contexte
__OBJECTIF__ Le projet démarre comme POC réalisé par un PO avec un assistant de code ; seules
les stacks d'ADA sont autorisées. Le site est public : il doit être bien référencé par les moteurs
de recherche, respecter le DSFR et publier sa déclaration d’accessibilité.

## Options considérées
### Option A — Nuxt 4, pages générées à l’avance (`nuxt generate`), DSFR
- Chaque page est un fichier HTML complet (titre, description) : bon référencement, affichage
  immédiat, hébergement statique.
### Option B — Vue 3 (application d’une seule page)
- **Pourquoi pas** : le contenu n’existe qu’après exécution du JavaScript : moins bien référencé.
### Option C — VitePress
- **Pourquoi pas** : adapté à de la documentation, sans le DSFR complet.

## Décision
**Option retenue : A** — choix du PO, conforme aux consignes de l'équipe technique.

## Conséquences
- **Positives** : référencement, DSFR complet (en-tête, pied de page, composants), accessibilité
  de chaque page générée vérifiée automatiquement.
- **Négatives** : un contenu qui change à chaque visite demande une API (hors de ce modèle).
- **À surveiller** : formulaires ou données dynamiques = nouvelle ADR (API, rendu côté serveur).

## Suivi
- [x] Implémentation : création du projet depuis ADA
