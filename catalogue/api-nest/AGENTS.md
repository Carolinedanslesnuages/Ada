# __NOM_PROJET__ — instructions pour les agents de code

Lu par Codex, OpenCode, Cursor, Copilot, Gemini CLI… ; `CLAUDE.md` l'importe pour Claude Code.

Objectif : __OBJECTIF__

**C'est une API, sans écran** : d'autres services l'appellent. Sa **documentation OpenAPI**
(`/api/docs`, générée à partir du code) est ce que montre l'aperçu : elle doit rester juste et lisible.

## Conventions
- **Noms explicites** : chaque variable, fonction, paramètre ou classe dit ce qu'il contient
  ou fait, en toutes lettres (`salleLibre`, `reservationsDuJour`), jamais `el`, `x`, `s`, `tmp`,
  `data2`. Seuls les noms imposés par les bibliothèques restent tels quels. Contrôlé par le lint
  (`id-length`, 3 caractères minimum) : la CI échoue sinon.
- NestJS en modules ESM (imports avec suffixe `.js`). **Un module par domaine** (`src/<domaine>/`) ;
  chaque contrôleur déclare son chemin complet : `@Controller('api/<domaine>')` (pas de préfixe
  global : la racine mène à la documentation).
- **Entrées** : un DTO par corps de requête, validé par `class-validator` (`@IsString()`,
  `@IsInt()`…) ; la validation globale refuse tout champ inconnu. Jamais de `any`.
- **Documentation** : chaque route a son `@ApiTags`, ses réponses (`@ApiOkResponse`,
  `@ApiCreatedResponse`, `@ApiBadRequestResponse`…) et chaque DTO ses `@ApiProperty` avec un
  exemple **fictif** et une description en français. Une route non documentée est incomplète.
- **Erreurs** : codes HTTP justes (400 entrée invalide, 404 inconnu, 409 conflit), message clair
  en français (`throw new NotFoundException('Réservation introuvable')`).
- Accès aux données uniquement via `PrismaService` (module global, `src/prisma/`).
  Prisma 7 : client généré dans `src/generated/prisma` (ne pas modifier, ne pas commiter).
- **Toute modification de `api/prisma/schema.prisma` crée une migration
  (`npx prisma migrate dev --name <nom>`) et doit être signalée pour relecture.**
- **Changement incompatible** pour les services qui appellent l'API (champ renommé ou supprimé,
  route déplacée) : à éviter ; sinon le signaler, et le commit le dit (`feat!:`).
- Tout critère d'acceptation se traduit par au moins un test : unitaire (`*.spec.ts`) pour les
  règles, **e2e** (`test/*.e2e-spec.ts`, supertest) pour chaque route, réponses d'erreur comprises.

## Déploiement
- `api/Dockerfile` : image de production de l'API (NestJS compilée), utilisateur sans privilèges, comme
  dans les projets de l'organisation. La CI la construit et la lance avec la base à chaque
  demande (« Image et chart »).
- `docker-compose.yml` : la base seule pour développer (`make db`), ou tout le projet avec
  l'image de production (`make up`, http://localhost:3000/api/docs).
- `api/.env.example` : toute nouvelle variable d'environnement de l'API y est ajoutée, avec une valeur
  fictive. Le fichier `.env` n'est jamais commité.
- `.gitlab-ci-dso.yml` : construction de l'image sur Cloud Pi Native quand le dépôt y est copié
  en miroir. **Réservé aux développeurs et à l'équipe infra : ne pas le modifier.**
- `helm/` (présent si le projet est déployé) : chart Helm générique. **Réservé aux
  développeurs et à l'équipe infra : ne pas le modifier.** La base PostgreSQL est externe : son
  adresse est lue dans un secret créé par l'équipe infra. Les valeurs d'un environnement
  (registre, adresse) sont fournies hors du dépôt.

## Commandes
`make` liste les commandes ; chacune a son équivalent direct.

| Action | Commande | Équivalent |
|---|---|---|
| Installer | `make install` | `cp api/.env.example api/.env`, `cd api && npm ci` |
| Base de données | `make migrate` | `docker compose up -d --wait db` puis, s'il y a des migrations, `cd api && npx prisma migrate deploy` |
| Lancer l'API | `make dev` | `cd api && npm run start:dev` (port 3000 ; documentation : http://localhost:3000/api/docs) |
| Tests | `make test` | `cd api && npm test && npm run test:e2e` |
| Lint | `make lint` | `cd api && npm run lint` |
| Tous les contrôles | `make check` | lint, tests, puis `cd api && npm run build` |
| Tout lancer comme en production | `make up` (arrêt : `make down`) | `docker compose up -d --build --wait` : http://localhost:3000/api/docs |

## Messages de commit (release-please)
Conventional Commits, versions SemVer calculées par release-please (jamais à la main) :
`fix: …` → correctif (0.2.0 → 0.2.1), `feat: …` → fonctionnalité (0.2.0 → 0.3.0),
`feat!: …` ou `BREAKING CHANGE:` → changement incompatible (majeure ; mineure avant 1.0.0),
`test:`, `docs:`, `chore:`, `refactor:` → sans nouvelle version. Fusion en squash : le
**titre de la PR** devient le commit de `main` (contrôle « Titre de PR » en CI). Story issue
d'une issue GitHub : `Closes #<numéro>` dans le corps.

## Règles absolues
- **Un fichier, une responsabilité** : au plus 400 lignes non vides par fichier de code, 600 par fichier de test (contrôle « Taille des fichiers » en CI). Découper par responsabilité, jamais une fonction par fichier ; un fichier déjà trop long ne grossit plus.
- Aucune donnée réelle, aucun secret dans le dépôt (gitleaks bloque en CI, et en local une fois `pre-commit install` lancé ; `--no-verify` interdit).
- Une branche par story (`story/…`) ou par bug (`fix/…`) ; jamais de fusion par l'agent.
- Les décisions d'architecture sont tracées dans `docs/adr/`.
