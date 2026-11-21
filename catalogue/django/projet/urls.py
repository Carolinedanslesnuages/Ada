"""Adresses du site : l'accueil, l'administration (listes, fiches, droits) sous /admin/, et la version."""

from django.contrib import admin
from django.urls import path

from gestion.version import version
from gestion.views import accueil

admin.site.site_header = "__NOM_PROJET__"
admin.site.site_title = "__NOM_PROJET__"
admin.site.index_title = "Administration"

urlpatterns = [
    path("", accueil, name="accueil"),
    path("admin/", admin.site.urls),
    path("__version__", version, name="version"),
]
