# Commandes courantes du projet. « make » ou « make help » les liste.
.DEFAULT_GOAL := help
.PHONY: help install db migrate dev-api dev-front test lint check up down

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  make %-10s %s\n", $$1, $$2}'

install: ## Installe les dépendances (environnement Python de l'API, paquets du front)
	cd api && python3.13 -m venv .venv && .venv/bin/pip install --disable-pip-version-check -r requirements-dev.txt
	cd api && test -f .env || cp .env.example .env
	cd front && npm ci

db: ## Lance la base PostgreSQL seule (docker compose)
	docker compose up -d --wait db

migrate: db ## Met la base à jour (migrations Alembic)
	cd api && .venv/bin/alembic upgrade head

dev-api: migrate ## Lance l'API en développement (port 8000, documentation : /api/docs)
	cd api && .venv/bin/uvicorn app.main:app --reload

dev-front: ## Lance le front en développement (transmet /api au port 8000)
	cd front && npm run dev

test: ## Lance les tests de l'API et du front
	cd api && .venv/bin/pytest
	cd front && npm run test:unit -- --run

lint: ## Vérifie le style du code
	cd api && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd front && npx oxlint . && npx eslint .

check: lint test ## Tous les contrôles de la CI : style, types, tests, compilation
	cd api && .venv/bin/mypy app
	cd front && npm run type-check && npm run build-only

up: ## Lance tout avec les images de production : http://localhost:8080
	docker compose up -d --build --wait

down: ## Arrête tout (les données de la base sont gardées)
	docker compose down
