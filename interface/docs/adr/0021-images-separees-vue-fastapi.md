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
  - mêmes ajouts pour `vue-nest-dsfr`, `api-fastapi`, `api-nest` et `tableau-de-bord` ;
  - dossier `charts/app` (ADR-0008) ou `helm/` à la racine, plus courant dans l'organisation ;
  - publication des images et du chart depuis GitHub (`build-docker.yml`, `release-helm-local.yml`
    de fabnum-cicd).
