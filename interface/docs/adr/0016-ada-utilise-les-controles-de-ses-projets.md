# ADR-0016 — ADA passe les mêmes contrôles que ses projets

- **Statut** : Accepted
- **Date** : 2026-11-22
- **Décideurs** : responsable d'ADA
- **Sujet** : contrôles de la CI d'ADA elle-même

## Contexte
Depuis les ADR-0013 à 0015, les projets créés par ADA utilisent Constance, Madeleine et
Emmanuelle, tandis qu'ADA gardait ses propres copies (titre de PR, taille des fichiers,
gitleaks) et n'avait ni contrôle des dépendances ni contrôle d'accessibilité en navigateur.

## Décision
- **Constance** : `titre-pr.yml`, `taille-fichiers.yml` et `anti-fuite.yml` d'ADA sont ceux du
  socle (`check.yml` vérifie qu'ils sont identiques). Le job `secrets` de `check.yml` disparaît.
- **Madeleine** : `dependances.yml` et `madeleine.json` identiques au socle ; dépendances de
  l'interface figées sur leur verrou, `.npmrc` `save-exact=true`.
- **Olympe** : les skills `po-` passent le format Agent Skills, la sécurité (mode strict) et la
  qualité, en plus des invariants d'ADA (`verifier-skills.mjs`).
- **Emmanuelle** : la page de connexion de l'interface, construite et servie comme pour une
  personne non connectée (`scripts/serve-without-session.mjs`, l'API répond 401).
- Toutes les actions sont épinglées à un SHA.

## Conséquences
- **Positives** : une règle commune se vérifie de la même façon dans ADA et dans ses projets.
- **Négatives** : l'atelier, qui demande une connexion GitHub, n'est pas vérifié par Emmanuelle.
- Remplace la phrase « ADA garde ses propres workflows » de l'[ADR-0013](0013-socle-commun-des-modeles.md).
