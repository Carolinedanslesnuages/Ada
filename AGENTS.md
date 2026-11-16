# Atelier PO — interface web — instructions pour les agents de code

Lu par Codex, OpenCode, Cursor, Copilot, Gemini CLI… ; `CLAUDE.md` l'importe pour Claude Code.

Objectif : permettre à des Product Owners de produire des POC en autonomie — stories et
problèmes signalés à gauche, aperçu du produit à droite, au même endroit.

## Architecture
- `api/` : NestJS (ESM, imports en `.js`). Aucune base de données : **GitHub est la source de
  vérité** (issues = stories, labels = statuts ; voir `docs/adr/0001`). Le client GitHub agit au
  nom du PO connecté (jeton utilisateur de la GitHub App).
- `front/` : Vue 3 + DSFR (`@gouvminint/vue-dsfr`) + Pinia (session, projets, stories).
- Règles métier d'une story (4 critères au maximum, format de l'issue) : `api/src/stories/story.ts`,
  reprises côté front dans `front/src/lib/story.ts` (à garder alignées).

## Conventions
- Validation avec Zod côté API ; jamais de `any`.
- Erreurs GitHub traduites par `traduireErreurGithub` (404, 403, 401).
- Pinia dès qu'une donnée sert à plusieurs composants ; sinon `ref` local.
- Composants DSFR plutôt que du HTML maison ; un seul `h1` par page.
- Chaque critère, un test ; chaque écran ou formulaire, un test d'accessibilité automatique
  (`front/src/__tests__/accessibilite.ts`, axe-core).
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
Conventional Commits : `feat:`, `fix:` (nouvelle version), `test:`, `docs:`, `chore:`, `refactor:`.

## Règles absolues
- Aucun secret dans le dépôt (`api/.env` est ignoré ; gitleaks en local et en CI ; `--no-verify` interdit).
- Seuls les comptes de `LOGINS_AUTORISES` (ou le propriétaire) se connectent : ne jamais affaiblir ce contrôle.
- Aucune fonction de suppression de dépôt ou d'issue dans l'interface.
