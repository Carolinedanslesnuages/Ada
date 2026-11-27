# Commandes courantes du projet. « make » ou « make help » les liste.
.DEFAULT_GOAL := help
.PHONY: help install db migrate dev test lint check up down

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  make %-10s %s\n", $$1, $$2}'

install: ## Installe les dépendances (environnement Python)
	python3.13 -m venv .venv && .venv/bin/pip install --disable-pip-version-check -r requirements-dev.txt
	test -f .env || cp .env.example .env

db: ## Lance la base PostgreSQL seule (docker compose)
	docker compose up -d --wait db

migrate: db ## Met la base à jour (migrations Alembic)
	.venv/bin/alembic upgrade head

dev: migrate ## Lance l'API en développement (port 8000, documentation : /api/docs)
	.venv/bin/uvicorn app.main:app --reload

test: ## Lance les tests
	.venv/bin/pytest

lint: ## Vérifie le style du code
	.venv/bin/ruff check . && .venv/bin/ruff format --check .

check: lint test ## Tous les contrôles de la CI : style, types, tests
	.venv/bin/mypy app

up: ## Lance tout avec l'image de production : http://localhost:8000/api/docs
	docker compose up -d --build --wait

down: ## Arrête tout (les données de la base sont gardées)
	docker compose down
