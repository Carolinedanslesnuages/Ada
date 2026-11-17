# ADR-0001 — Choix de la stack : documentation VitePress aux couleurs de l’État

- **Statut** : Accepted
- **Date** : __DATE__
- **Décideurs** : __PO__, via ADA
- **Sujet** : stack technique du projet __NOM_PROJET__

## Contexte
__OBJECTIF__ Le projet démarre comme POC réalisé par un PO avec un assistant de code ; seules
les stacks d'ADA sont autorisées. Il s'agit de pages de documentation, écrites et relues simplement.

## Options considérées
### Option A — VitePress, thème par défaut aux couleurs de l’État
- Pages en Markdown, sommaire, menu et recherche intégrés ; site statique, sans serveur.
- Identité de l’État : police Marianne, bleu France, bloc-marque « République française ».
### Option B — Site Nuxt avec les composants du DSFR
- **Pourquoi pas** : chaque page serait un composant à coder ; plus lourd pour de la documentation.

## Décision
**Option retenue : A** — choix du PO, conforme aux consignes de l'équipe technique.

## Conséquences
- **Positives** : écrire une page = écrire un fichier Markdown ; chaque page construite est
  vérifiée automatiquement (liens, accessibilité).
- **Négatives** : ce n'est pas le DSFR complet (en-tête, pied de page et composants restent ceux de
  VitePress) ; thème clair seulement, sans bloc « page précédente / suivante » (problèmes
  d'accessibilité du thème de VitePress).
- **À surveiller** : un site public de l’État exige le DSFR complet (modèle Nuxt, nouvelle ADR).

## Suivi
- [x] Implémentation : création du projet depuis ADA
