"""Contrat repo-version-json (format Dockerflow) : le fichier de l'image, sinon « dev »."""

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.http import HttpRequest, JsonResponse

VERSION_DEV: dict[str, Any] = {
    "source": "",
    "version": "dev",
    "commit": "",
    "build": "",
    "code_date": "",
    "changes": [],
    "history": [],
}


def lire_version(fichier: Path) -> dict[str, Any]:
    try:
        contenu: dict[str, Any] = json.loads(fichier.read_text(encoding="utf-8"))
        return contenu
    except (OSError, ValueError):
        return dict(VERSION_DEV)


def version(requete: HttpRequest) -> JsonResponse:
    """Sans authentification, jamais une erreur : « dev » quand le fichier manque (poste, tests, aperçu)."""
    reponse = JsonResponse(lire_version(settings.VERSION_JSON))
    reponse["Cache-Control"] = "no-store"
    return reponse
