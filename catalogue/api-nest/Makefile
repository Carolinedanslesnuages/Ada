# Commandes courantes du projet. « make » ou « make help » les liste.
.DEFAULT_GOAL := help
.PHONY: help install db migrate dev test lint check up down

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  make %-10s %s\n", $$1, $$2}'

install: ## Installe les dépendances de l'API
	cd api && test -f .env || cp .env.example .env
	cd api && npm ci

db: ## Lance la base PostgreSQL seule (docker compose)
	docker compose up -d --wait db

migrate: db ## Met la base à jour (migrations Prisma, s'il y en a)
	cd api && if [ -d prisma/migrations ]; then npx prisma migrate deploy; fi

dev: migrate ## Lance l'API en développement (port 3000, documentation : /api/docs)
	cd api && npm run start:dev

test: ## Lance les tests de l'API
	cd api && npm test && npm run test:e2e

lint: ## Vérifie le style du code
	cd api && npm run lint

check: lint test ## Tous les contrôles de la CI : style, tests, compilation
	cd api && npm run build

up: ## Lance tout avec l'image de production : http://localhost:3000/api/docs
	docker compose up -d --build --wait

down: ## Arrête tout (les données de la base sont gardées)
	docker compose down
