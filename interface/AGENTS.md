# ADA — interface web — instructions pour les agents de code

Lu par Codex, OpenCode, Cursor, Copilot, Gemini CLI… ; `CLAUDE.md` l'importe pour Claude Code.

Objectif : permettre à des Product Owners de produire des POC en autonomie. Le PO crée son
projet dans l'atelier, **écrit ses stories et ses signalements dans GitHub** (formulaires
d'issue du projet), puis les voit apparaître dans l'atelier et **les lance une par une** ;
l'aperçu du produit tourne à droite dès la création du projet.

## Architecture
- `api/` : NestJS (ESM, imports en `.js`). Aucune base de données : **GitHub est la source de
  vérité** (issues = stories, labels = statuts ; voir `docs/adr/0001`). Le client GitHub agit au
  nom du PO connecté (jeton utilisateur de la GitHub App).
- `front/` : Vue 3 + DSFR (`@gouvminint/vue-dsfr`) + Pinia (session, projets, stories).
- Règles d'une demande (lecture des formulaires GitHub, « prête » = complète et 4 critères au
  maximum, une seule active par projet) : `api/src/stories/story.ts` ; types côté front dans
  `front/src/lib/story.ts`. **L'atelier ne crée de story qu'à la demande explicite du PO** :
  quand il valide un découpage proposé par l'assistant (stories préremplies, relues et
  éventuellement corrigées par lui, publiées à son nom ; la demande d'origine devient leur
  parent). Sinon, il lit, vérifie, lance.
- Projets : identifiant `nom` (organisation d'ADA) ou `compte~nom` (compte personnel du PO),
  lu par `api/src/projets/depot.ts` ; toute route `projets/:depot` passe par `ProjetGuard`. Un
  projet existant est d'abord analysé par l'assistant (phase « reprise », `api/src/agent/consigne-reprise.ts`),
  puis entre dans ADA par une PR de reprise que le PO fusionne (`docs/adr/0010`).
- Aperçu (`api/src/apercu/`) : clone du dépôt avec le jeton du PO (jeton passé par
  l'environnement, jamais en argument), puis `docker compose` (PostgreSQL + application, limites
  mémoire/CPU, ports 5300-5399 sur 127.0.0.1). Dossier de travail `apercus/`, hors git.

## Conventions
- Validation avec Zod côté API ; jamais de `any`.
- Erreurs GitHub traduites par `traduireErreurGithub` (404, 403, 401).
- Pinia dès qu'une donnée sert à plusieurs composants ; sinon `ref` local.
- Composants DSFR plutôt que du HTML maison ; un seul `h1` par page.
- Chaque critère, un test ; chaque écran ou formulaire, un test d'accessibilité automatique
  (`front/src/__tests__/accessibilite.ts`, axe-core).
- **Accessibilité (RGAA)** : mêmes bases que pour les projets (section « Accessibilité » de
  `catalogue/vue-nest-dsfr/AGENTS.md`, reprises dans `api/src/agent/agent.ts`) ; vérifiées par le lint
  `eslint-plugin-vuejs-accessibility` (règle `label-has-for` adaptée au DSFR : for/id suffit).
- Mocks typés dans les tests front (`vi.fn<() => Promise<T>>()`).

## Commandes
| Action | Commande |
|---|---|
| Lancer l'API | `cd api && npm run start:dev` (port 3100, préfixe `/api`) |
| Lancer le front | `cd front && npm run dev` (port 5180, proxy `/api` et `/__version__`) |
| Tests | `cd api && npm test && npm run test:e2e && cd ../front && npm run test:unit -- --run` |
| Lint | `cd api && npm run lint && cd ../front && npx oxlint . && npx eslint .` |
| Compilation | `cd api && npm run build && cd ../front && npm run type-check && npm run build-only` |

## Messages de commit (release-please)
Conventional Commits, versions SemVer par release-please : `fix:` → correctif, `feat:` →
mineure, `!` / `BREAKING CHANGE:` → majeure (mineure avant 1.0.0) ; `test:`, `docs:`, `chore:`,
`refactor:` sans version. Fusion en squash : le titre de la PR devient le commit de `main` ; il
est vérifié en CI (`titre-pr.yml`) et par ADA avant de fusionner une demande
(`api/src/versions/conventionnel.ts`).

## Règles absolues
- Aucun secret dans le dépôt (`api/.env` est ignoré ; gitleaks en local et en CI ; `--no-verify` interdit).
- Seuls les comptes de `LOGINS_AUTORISES` (ou le propriétaire) se connectent : ne jamais affaiblir ce contrôle.
- Aucune fonction de suppression de dépôt ou d'issue dans l'interface.
