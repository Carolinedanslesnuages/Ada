# Image de production du front : fichiers construits, servis par nginx sans privilèges.
# L'API a sa propre image : api/Dockerfile.
# Construction : docker build -t <nom>-front front
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# corepack fournit la version de pnpm inscrite dans package.json (« packageManager »).
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build-only

FROM nginxinc/nginx-unprivileged:1.29-alpine
# Adresse de l'API vue depuis ce conteneur (docker compose : service « api » ; Helm : le chart la fournit).
ENV ADRESSE_API=http://api:3000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Utilisateur « nginx » de l'image de base, écrit ici pour que les contrôles le voient.
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
