# Image de production de l'API (FastAPI). Le front a sa propre image : front/Dockerfile.
# Deux étapes : la première installe les dépendances avec uv, la seconde ne garde que
# l'environnement Python et le code.
# Construction : docker build --build-arg VERSION=$(cat version.txt) --build-arg COMMIT=$(git rev-parse HEAD) -t <nom>-api api
FROM python:3.13-slim AS build
ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
RUN pip install --no-cache-dir --disable-pip-version-check uv==0.13.8
COPY pyproject.toml uv.lock ./
# Dépendances d'exécution seulement, aux versions exactes de uv.lock.
RUN uv sync --frozen --no-dev --no-install-project --no-cache

FROM python:3.13-slim
ARG VERSION=dev
ARG COMMIT=""
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/app/.venv/bin:$PATH \
    VERSION_JSON=/app/version.json
WORKDIR /app
COPY --from=build /app/.venv ./.venv
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
# Contrat repo-version-json (format Dockerflow), lu par /__version__.
RUN printf '{"source":"","version":"%s","commit":"%s","build":"","code_date":"","changes":[],"history":[]}\n' "$VERSION" "$COMMIT" > /app/version.json \
 && useradd --uid 1000 --user-group --no-create-home application
USER 1000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api', timeout=2)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
