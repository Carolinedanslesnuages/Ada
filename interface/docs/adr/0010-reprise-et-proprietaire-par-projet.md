# ADR-0010 — Reprise d'un projet existant : un propriétaire par projet, une PR de reprise

- **Statut** : Accepted
- **Date** : 2026-11-17
- **Décideurs** : responsable d'ADA
- **Sujet** : faire entrer dans ADA un dépôt qu'elle n'a pas créé (#37), de l'organisation ou du
  compte personnel du PO

## Contexte
Jusqu'ici, tous les projets appartenaient à un seul compte (`GITHUB_PROPRIETAIRE`) et étaient créés
par ADA depuis le catalogue. Un PO veut aussi faire évoluer avec ADA un POC déjà commencé, parfois
dans son propre compte GitHub.

## Décision
1. **Un propriétaire par projet.** L'identifiant d'un projet dans ADA reste son nom pour
   l'organisation d'ADA (adresses et aperçus existants inchangés) et devient `compte~nom` ailleurs
   (`~` n'existe ni dans un login ni dans un nom de dépôt GitHub). Toutes les routes
   `projets/:depot` passent par `ProjetGuard` : un PO n'ouvre que les projets de l'organisation et
   de **son** compte ; ses droits GitHub s'appliquent en plus.
2. **Le PO choisit la stack** la plus proche dans le catalogue : elle fournit l'`ada.json` (aperçu,
   contrôles de l'assistant).
3. **ADA propose, le PO valide.** ADA pose le topic `ada-reprise`, les labels, puis ouvre une PR
   « chore: reprise du projet par ADA » depuis `ada/reprise`, avec les seuls fichiers manquants :
   formulaires de story et de signalement, vérification du titre des PR, release-please, et
   `ada.json` (seul contrôle exigé : le titre de PR ; la CI du projet reste la sienne). Rien
   n'arrive sur `main` sans la fusion du PO.
4. **Apparence choisie par le PO, sans DSFR par défaut** : du code existant garde son design.
   `ada.json` porte `"dsfr": false` ; l'assistant réutilise alors les composants du projet et
   n'introduit ni le DSFR ni une autre bibliothèque d'interface (l'accessibilité RGAA reste
   exigée). Les modèles sans identité de l'État (extension, composant, API) portent aussi
   `"dsfr": false`.
5. **Le projet entre dans ADA quand `ada.json` est sur `main`** ; ADA remplace alors `ada-reprise`
   par le topic `ada`.

## Options écartées
- **Pousser directement sur `main`** : contraire à la règle « le PO valide tout ».
- **Projets sans identifiant de compte (nom seul)** : deux dépôts de même nom (organisation et
  compte perso) se confondraient.
- **Adapter automatiquement le projet à une stack** (réécrire sa structure) : trop intrusif ; si
  l'aperçu ne démarre pas, un développeur ajuste `ada.json`.

## Conséquences
- La branche principale doit s'appeler `main` (ADA y travaille) ; sinon la reprise est refusée
  avec une explication.
- Marquer un dépôt demande d'en être administrateur.
- ADA ne voit que les dépôts où son application GitHub est installée : l'écran de reprise indique
  comment l'autoriser sur un compte personnel.
