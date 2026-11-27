# Image de production de l'API (NestJS). Le front a sa propre image : front/Dockerfile.
# Les outils de développement restent dans l'image : Prisma en a besoin pour jouer les migrations.
# Construction : docker build --build-arg VERSION=$(cat version.txt) --build-arg COMMIT=$(git rev-parse HEAD) -t <nom>-api api
FROM node:24-bookworm-slim
ARG VERSION=dev
ARG COMMIT=""
ENV PORT=3000 \
    VERSION_JSON=/app/version.json
WORKDIR /app
COPY package.json package-lock.json .npmrc prisma.config.ts ./
COPY prisma ./prisma
# « npm ci » génère aussi le client Prisma (postinstall).
RUN npm ci --no-audit --no-fund --fetch-retries=5
COPY . .
# Contrat repo-version-json (format Dockerflow), lu par /__version__.
RUN npm run build \
 && printf '{"source":"","version":"%s","commit":"%s","build":"","code_date":"","changes":[],"history":[]}\n' "$VERSION" "$COMMIT" > /app/version.json
ENV NODE_ENV=production
# Numéro de l'utilisateur « node » : Kubernetes vérifie ainsi que ce n'est pas root.
USER 1000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/api').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main"]
