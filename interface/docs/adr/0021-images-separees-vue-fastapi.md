# ADR-0021 — Le modèle `vue-fastapi` se déploie comme les projets de l'organisation

- **Statut** : Accepted
- **Date** : 2026-11-27
- **Décideurs** : responsable d'ADA
- **Sujet** : de quoi lancer et déployer un projet créé avec le modèle `vue-fastapi`

## Contexte
L'ADR-0008 donne une image et un chart aux modèles dont l'API Node.js sert aussi le front. Le
modèle `vue-fastapi`, lui, n'avait que la base dans `docker-compose.yml`. Or Vue + FastAPI est la
pile la plus fréquente dans les dépôts `dnum-mi` et `IA-Generative` actifs en 2026, et presque
tous ces projets ont : une image par partie (front servi par nginx sans privilèges, API Python),
un `docker-compose.yml` qui lance tout, un fichier `.gitlab-ci-dso.yml` pour construire les images
sur Cloud Pi Native, un `.env.example` et un `Makefile`. Un développeur qui reprend un POC doit
retrouver cette forme.

## Options considérées
### A — Une seule image, l'API sert le front (comme `vue-node`, ADR-0008)
- Une image, un déploiement ; les contrôles d'ADA existent déjà.
- **Pourquoi pas** : ce n'est pas ce que font les projets Vue + FastAPI de l'organisation ; il
  faudrait faire servir des fichiers statiques par FastAPI, ce qu'aucun d'eux ne fait.
### B — Deux images, comme les projets de l'organisation
- `api/Dockerfile` et `front/Dockerfile` ; nginx transmet `/api` à l'API.

## Décision
**Option B**, pour `vue-fastapi` seulement ; l'ADR-0008 reste valable pour les modèles Node.js.
- **Deux images** sans privilèges, système de fichiers en lecture seule possible ; contrat
  `/__version__` porté par l'API, joignable par le front.
- **`docker-compose.yml`** : `db` seule pour développer, ou tout le projet (base, migrations,
  API, front sur le port 8080). La CI du projet lance ce même fichier et vérifie que le front
  répond et transmet `/api` (« Image et chart »).
- **Chart Helm** (dossier `helm/`, voir plus bas), toujours sur demande (« Ce projet sera-t-il déployé ? ») : deux
  déploiements, l'API jamais exposée directement, migrations Alembic jouées avant le démarrage de
  l'API, **base PostgreSQL externe** dont l'adresse est lue dans un secret créé hors du dépôt.
- **`.gitlab-ci-dso.yml`** : les deux tâches de construction du catalogue de Cloud Pi Native
  (`vault-ci.yml`, `kaniko-ci.yml`), sur chaque étiquette de version.
- **`api/.env.example`** et **`Makefile`** (`make install`, `make dev-api`, `make test`, `make up`…).

## Conséquences
- **Positives** : même forme que les projets des équipes ; un POC se lance en une commande et se
  reprend sans réécrire le déploiement.
- **Négatives** : deux images à construire en CI ; le fichier `.gitlab-ci-dso.yml` n'est vérifié
  par aucun contrôle d'ADA (il ne s'exécute que sur Cloud Pi Native).
- **Encore ouvert** :
  - publication des images et du chart depuis GitHub (`build-docker.yml`, `release-helm-local.yml`
    de fabnum-cicd).

## Suite du 2026-11-27 — `vue-nest-dsfr`
Même décision pour `vue-nest-dsfr` (point laissé ouvert par l'ADR-0008), avec deux différences :
- Prisma reste dans l'image de l'API : il joue les migrations avant le démarrage ;
- le client Prisma est généré avec des imports en « .js » (`importFileExtension`), sans quoi
  l'API compilée (`node dist/main`) ne démarrait pas. Le défaut existait avant ; il n'était pas vu
  parce que l'aperçu lance l'API en mode développement.

## Suite du 2026-11-27 — `tableau-de-bord`, `api-nest`, `api-fastapi`
- `tableau-de-bord` : comme `vue-nest-dsfr`. Les données fictives sont chargées par
  `docker compose` et `make migrate`, jamais par le chart.
- `api-nest` et `api-fastapi` : une seule image (pas de front), un chart à un déploiement, l'API
  exposée par l'ingress.
- Le défaut des imports du client Prisma est corrigé dans les trois modèles NestJS.

## Suite du 2026-11-27 — conventions de déploiement de la Fabnum
Relecture contre `dnum-mi/transversal-doc` (`docs/conventions/deploiement.md`). Règle retenue :
**les recommandations de la Fabnum sont suivies**, y compris quand elles demandent de modifier ADA.
- **OpenShift** : les charts ne fixent plus de numéro d'utilisateur (OpenShift attribue le sien) ;
  les images déclarent un utilisateur numérique et tournent avec un utilisateur quelconque.
- **Dossier `helm/`** à la racine du projet, à la place de `charts/app`, dans les huit modèles
  déployables (remplace ce point de l'ADR-0008). L'assistant ne peut modifier ni `helm/` ni
  `charts/` : les projets créés avant gardent leur dossier `charts/`.
- **Images en plusieurs étapes** pour les API NestJS : la première compile, la seconde ne garde
  que les dépendances d'exécution. `prisma` (migrations) et `dotenv` (lu par `main.ts`) deviennent
  des dépendances d'exécution, ce qu'elles étaient déjà dans les faits.

## Suite du 2026-11-27 — pnpm, uv et ESLint (étape 2), `vue-fastapi` d'abord
Pages lues : `conventions/lint-formattage`, `stack/eslint`, `stack/index`, `serveur/fastapi`.
- **Front** : pnpm (`packageManager` dans `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` pour
  les `overrides`) et `@antfu/eslint-config` à la place d'oxlint, d'ESLint seul et de Prettier. Les
  règles de surcharge sont celles de `stack/eslint`, sauf `import/order`, absente de la version 10
  (qui trie déjà les imports). L'accessibilité reste vérifiée à l'écriture (`vue: { a11y: true }`).
  pnpm refuse un paquet non déclaré : `@gouvfr/dsfr` devient une dépendance directe.
- **API** : uv (`pyproject.toml` en versions exactes, `uv.lock`) à la place de `requirements.txt` ;
  Ruff aligné (88 colonnes, règles `C4`), en gardant `S` et `RUF`.
- **Aperçu d'ADA** : le fichier de verrou décide. `pnpm-lock.yaml` → pnpm (version de
  `packageManager`, installée par npm dans le cache partagé) ; `uv.lock` → uv ; sinon npm et pip
  comme avant. Les projets déjà créés ne changent pas.
- **Dockerfile** : API en deux étapes avec uv ; pnpm par corepack dans l'image du front.
- **Reste à faire pour les autres modèles** : mêmes changements pour les modèles Vue et Python
  (`vue-nest-dsfr`, `api-fastapi`, `tableau-de-bord`, `vue-node*`, et les modèles front seuls).
  Le contrôle « Dépendances » (Madeleine) ne lit que les `package.json` : il ne vérifie pas
  `pyproject.toml`.

## Suite du 2026-11-27 — `vue-nest-dsfr` et `tableau-de-bord` (étape 2)
Page lue en plus : `serveur/nestjs`.
- **Front et API** en pnpm (un verrou par dossier, comme l'aperçu et le chart les attendent) et
  `@antfu/eslint-config` à la place d'oxlint, ESLint seul et Prettier. L'API reprend les surcharges
  « projet back » de `stack/eslint`, plus `ts/consistent-type-imports` désactivée (l'injection de
  dépendances de NestJS lit les types des constructeurs) et les règles typées gardées sauf les plus
  strictes pour un POC (`strict-boolean-expressions`, `no-unsafe-*`) : une promesse oubliée reste
  refusée, comme avec oxlint avant.
- **ESLint 10.14.0 dans l'API** (le front reste en 10.15.0, déjà présent) : Madeleine refuse une version de moins de 14 jours.
- **Code touché dans l'API** : `process` s'importe de `node:process` (règle de la config) et
  `main.ts` n'a plus d'`await` de haut niveau.
- **pnpm 12 et la chaîne d'approvisionnement** : les scripts d'installation de Prisma sont
  autorisés (`allowBuilds`), et `prisma@7.10.1` est exclue de la règle « trust downgrade » (Prisma
  publie sans attestation depuis la 7.10.0 ; la 7.9.0 en a une). **Exception à retirer** dès qu'une
  version attestée de Prisma sort. Décision à confirmer par le responsable d'ADA.
- **Dockerfile de l'API** : pnpm par corepack, installation `--prod` dans la seconde étape.
- **Aperçu** : l'`export PATH` de pnpm est en tête de `travail.sh` : l'installation tourne dans un
  sous-shell, et les commandes d'arrière-plan et de premier plan (`pnpm start:dev`) l'ignoraient.
- **Pas encore faits sur NestJS** (`serveur/nestjs`) : journaux JSON avec `nestjs-pino`, filtre
  d'erreurs structuré, arborescence `src/modules/<nom>/controllers|providers|entity`.
- **Reste pour l'étape 2** : `api-nest`, `api-fastapi`, `traitement-python` (uv), les modèles
  front seuls et `vue-node*`, `formulaire`.

