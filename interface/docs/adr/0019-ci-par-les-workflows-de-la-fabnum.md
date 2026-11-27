# ADR-0019 — Les contrôles d'ADA et de ses projets passent d'abord par les outils de la Fabnum

- **Statut** : Accepted
- **Date** : 2026-11-27
- **Décideurs** : responsable d'ADA
- **Sujet** : aligner la CI d'ADA et du socle des projets sur `dnum-mi/fabnum-cicd` et les
  conventions de la Fabrique numérique (`dnum-mi/transversal-doc`)

## Contexte
ADA n'appelait qu'un workflow de la Fabnum, `release-app.yml` (ADR-0007). Les conventions de la
Fabrique numérique demandent fortement les workflows réutilisables de `dnum-mi/fabnum-cicd`
plutôt que des pipelines réécrits, des actions épinglées et un `.editorconfig` commun. ADA doit
être aussi irréprochable que les projets qu'elle crée : la règle vaut pour elle et pour le socle.

## Décision
**Un outil de la Fabnum passe en premier quand il existe ; sinon, l'outil actuel reste.**
Les mêmes fichiers sont dans ADA et dans `catalogue/socle/`, et la CI d'ADA vérifie qu'ils sont identiques.

| Contrôle | Avant | Maintenant |
|---|---|---|
| Anti-fuite | action Constance | `scan-gitleaks.yml` (fabnum-cicd) |
| Commits de la PR | aucun | `lint-commits.yml` (fabnum-cicd) |
| Sécurité des workflows | aucun | `scan-zizmor.yml` (fabnum-cicd) |
| Mauvaises configurations (Dockerfile, chart) | aucun | `scan-trivy.yml` en mode configuration, sévérité haute ou critique |
| Versions | `release-app.yml` v0.25.3 | `release-app.yml` v0.25.5 |
| Hook `commit-msg` local | aucun | `conventional-commit` de fabnum-cicd (`scripts/installer-hooks-git.sh`) |
| `.editorconfig` | ceux de create-vue, dans 8 modèles | celui des conventions, dans le socle (plus 4 espaces pour Python) |

- Tous les workflows fabnum-cicd sont épinglés au **même** SHA (v0.25.5), comme le hook.
- Toutes les actions sont épinglées à leur SHA, avec `persist-credentials: false`, comme le
  demandent zizmor et la règle « actions tierces épinglées par SHA » de fabnum-cicd.
- Restent, faute d'équivalent à la Fabnum : le titre de PR (`lint-commits` lit les commits, pas
  le titre, qui devient le commit de `main` à la fusion en squash), la taille des fichiers
  (ADR-0012), les dépendances en version exacte (ADR-0014) et l'accessibilité des pages
  construites (ADR-0015).
- Un workflow réutilisable nomme son contrôle `<job appelant> / <job appelé>` : les `ada.json`
  des modèles et `ADA_PAR_DEFAUT` exigent les nouveaux noms.

## Conséquences
- **Positives** : la CI d'ADA et de ses projets suit celle de l'organisation ; une montée de
  version de fabnum-cicd se fait à un seul endroit, vérifié par la CI.
- **Négatives** : quatre contrôles requis de plus par PR. Les projets créés avant ce changement
  gardent leurs anciens workflows et leur `ada.json` : rien ne change pour eux.
- **À suivre (étapes suivantes)** : la porte unique `check-jobs` et un `cd.yml` (build et scan de
  l'image) ; la stack des conventions (pnpm, `@antfu/eslint-config`, uv) ; le code d'ADA en
  anglais ; les skills `fabnum-*` de `transversal-doc` données à l'agent. Les skills de
  fabnum-cicd et de transversal-doc sont encore en PR dans leurs dépôts (fabnum-cicd #136,
  transversal-doc #32).
