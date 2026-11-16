# ADR-0007 — Versions par le workflow commun de la DNUM (fabnum-cicd)

- **Statut** : Accepted
- **Date** : 2026-11-16
- **Décideurs** : équipe ADA
- **Sujet** : harmoniser les releases des projets créés par ADA avec le reste de l'organisation (issue #11)

## Contexte
ADA et chacun de ses modèles appelaient directement `googleapis/release-please-action@v5.0.0`.
La DNUM centralise des workflows réutilisables dans
[dnum-mi/fabnum-cicd](https://github.com/dnum-mi/fabnum-cicd), dont `release-app.yml`
(release-please, tags, pré-releases, fusion automatique optionnelle), `lint-commits.yml` et
`scan-gitleaks.yml`.

## Options considérées
### Option A — Appeler `release-app.yml`, épinglé à une version et à son SHA
- Même action release-please (v5.0.0) et mêmes fichiers (`release-please-config.json`,
  `.release-please-manifest.json`) : la PR de version reste identique, et le panneau
  « Versions » d'ADA (qui ne publie qu'une PR ne touchant que les fichiers de version) aussi.
- Les règles de version des projets suivent celles de l'organisation, et leurs évolutions.
### Option B — Garder l'appel direct à release-please
- **Pourquoi pas** : chaque projet dérive de la règle commune.

## Décision
**Option A**, sans pré-release ni fusion automatique : c'est le PO qui publie depuis ADA. Le
workflow est identique dans ADA et dans chaque modèle (`catalogue/*/`), épinglé à
`v0.25.3` (`30674ee…`) ; la CI d'ADA vérifie l'épinglage et l'identité des copies.

**`lint-commits.yml` et `scan-gitleaks.yml` : pas maintenant.**
- `lint-commits.yml` vérifie chaque commit de la PR, pas son **titre** ; or, fusion en squash,
  c'est le titre qui devient le commit de `main` et décide de la version. Notre contrôle
  « Titre de PR (Conventional Commits, semver) » reste donc nécessaire.
- `scan-gitleaks.yml` est équivalent à notre anti-fuite, mais changerait le nom du contrôle requis
  (`<job appelant> / <job appelé>`) dans la protection de `main` et l'`ada.json` de chaque projet,
  y compris des projets existants. À reprendre lors du passage en organisation.

## Conséquences
- **Positives** : une seule manière de publier dans l'organisation ; montée de version du
  workflow = un changement à un endroit (ADA et ses modèles), vérifié par la CI.
- **Négatives** : dépendance à un dépôt externe (atténuée par l'épinglage au SHA).
- **À surveiller** : avec les identifiants d'une GitHub App (`APP_CLIENT_ID`,
  `APP_PRIVATE_KEY`), `release-app.yml` ferait tourner la CI sur la PR de version — c'est
  l'option C de l'ADR-0005, à mettre en place avec l'organisation (secret d'organisation).
