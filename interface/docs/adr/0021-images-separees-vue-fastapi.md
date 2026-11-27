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
- **Chart `charts/app`**, toujours sur demande (« Ce projet sera-t-il déployé ? ») : deux
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
  - dossier `charts/app` (ADR-0008) ou `helm/` à la racine, plus courant dans l'organisation ;
  - publication des images et du chart depuis GitHub (`build-docker.yml`, `release-helm-local.yml`
    de fabnum-cicd).

## Suite du 2026-11-27 — `vue-nest-dsfr`
Même décision pour `vue-nest-dsfr` (point laissé ouvert par l'ADR-0008), avec deux différences :
- l'image de l'API garde les outils de développement, comme dans les projets NestJS + Prisma de
  l'organisation : Prisma en a besoin pour jouer les migrations avant le démarrage ;
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
Relecture contre `dnum-mi/transversal-doc` (`docs/conventions/deploiement.md`) :
- **OpenShift** : les charts ne fixent plus de numéro d'utilisateur (OpenShift attribue le sien) ;
  les images déclarent un utilisateur numérique et tournent avec un utilisateur quelconque.
- **Écarts connus, non corrigés** : le chart est dans `charts/app` et non `helm/` (dossier protégé
  par le code d'ADA) ; l'image des API NestJS n'est pas en plusieurs étapes, parce que Prisma
  (outil de développement) joue les migrations.

