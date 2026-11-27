# Commandes courantes du projet. « make » ou « make help » les liste.
.DEFAULT_GOAL := help
.PHONY: help install db migrate dev-api dev-front test lint format check up down

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  make %-10s %s\n", $$1, $$2}'

install: ## Installe les dépendances (uv pour l'API, pnpm pour le front)
	cd api && uv sync
	cd api && test -f .env || cp .env.example .env
	cd front && pnpm install --frozen-lockfile

db: ## Lance la base PostgreSQL seule (docker compose)
	docker compose up -d --wait db

migrate: db ## Met la base à jour (migrations Alembic)
	cd api && uv run alembic upgrade head

dev-api: migrate ## Lance l'API en développement (port 8000, documentation : /api/docs)
	cd api && uv run uvicorn app.main:app --reload

dev-front: ## Lance le front en développement (transmet /api au port 8000)
	cd front && pnpm dev

test: ## Lance les tests de l'API et du front
	cd api && uv run pytest
	cd front && pnpm test:unit --run

lint: ## Vérifie le style du code
	cd api && uv run ruff check . && uv run ruff format --check .
	cd front && pnpm lint

format: ## Corrige le style du code
	cd api && uv run ruff check --fix . && uv run ruff format .
	cd front && pnpm format

check: lint test ## Tous les contrôles de la CI : style, types, tests, compilation
	cd api && uv run mypy app
	cd front && pnpm type-check && pnpm build-only

up: ## Lance tout avec les images de production : http://localhost:8080
	docker compose up -d --build --wait

down: ## Arrête tout (les données de la base sont gardées)
	docker compose down
