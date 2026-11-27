# Commandes courantes du projet. « make » ou « make help » les liste.
.DEFAULT_GOAL := help
.PHONY: help install db migrate dev-api dev-front test lint format check up down

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  make %-10s %s\n", $$1, $$2}'

install: ## Installe les dépendances de l'API et du front (pnpm)
	cd api && test -f .env || cp .env.example .env
	cd api && pnpm install --frozen-lockfile
	cd front && pnpm install --frozen-lockfile

db: ## Lance la base PostgreSQL seule (docker compose)
	docker compose up -d --wait db

migrate: db ## Met la base à jour (migrations Prisma) et charge les données fictives
	cd api && npx prisma migrate deploy && npx prisma db execute --file prisma/donnees-fictives.sql

dev-api: migrate ## Lance l'API en développement (préfixe /api, port 3000)
	cd api && pnpm start:dev

dev-front: ## Lance le front en développement (transmet /api au port 3000)
	cd front && pnpm dev

test: ## Lance les tests de l'API et du front
	cd api && pnpm test && pnpm test:e2e
	cd front && pnpm test:unit --run

lint: ## Vérifie le style du code
	cd api && pnpm lint
	cd front && pnpm lint

format: ## Corrige le style du code
	cd api && pnpm format
	cd front && pnpm format

check: lint test ## Tous les contrôles de la CI : style, types, tests, compilation
	cd api && pnpm build
	cd front && pnpm type-check && pnpm build-only

up: ## Lance tout avec les images de production : http://localhost:8080
	docker compose up -d --build --wait

down: ## Arrête tout (les données de la base sont gardées)
	docker compose down
