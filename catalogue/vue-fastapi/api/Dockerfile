# Image de production de l'API (FastAPI). Le front a sa propre image : front/Dockerfile.
# Construction : docker build --build-arg VERSION=$(cat version.txt) --build-arg COMMIT=$(git rev-parse HEAD) -t <nom>-api api
FROM python:3.13-slim
ARG VERSION=dev
ARG COMMIT=""
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VERSION_JSON=/app/version.json
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt
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
