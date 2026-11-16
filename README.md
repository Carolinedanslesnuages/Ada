# Atelier PO — interface web

Les Product Owners créent leurs projets, écrivent leurs stories et signalent des problèmes ;
l'aperçu du produit s'affiche à côté. Consignes pour les agents de code : [AGENTS.md](AGENTS.md).
Décisions : [docs/adr/](docs/adr/README.md).

## Mise en place de la GitHub App (une fois)

1. **Créer l'App** : GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
   - Homepage URL : `http://localhost:5180`
   - Callback URL : `http://localhost:5180/api/auth/github/callback`
   - Expire user authorization tokens : coché
   - Webhook → Active : **décoché**
   - Permissions de dépôt : Contents, Issues, Pull requests, Workflows, Administration,
     Repository creation : *Read and write* ; Actions, Checks, Commit statuses, Metadata : *Read-only*
   - Where can this GitHub App be installed : *Only on this account*
2. **Récupérer les identifiants** (page de l'App, onglet General) : *Client ID*, puis
   *Generate a new client secret* (40 caractères hexadécimaux, affiché une seule fois — pas la
   section *Private keys*). Les mettre dans `api/.env` (modèle : `api/.env.example`).
3. **Installer l'App** — étape indispensable, distincte de l'autorisation : page de l'App →
   **Install App** → compte ou organisation → **All repositories**. Sans installation, l'App
   est autorisée à agir au nom du PO mais ne voit aucun dépôt : la création de projet échoue
   (404 sur `…/generate`).
4. **Créer le dépôt modèle** de chaque stack et le marquer *template*
   (`modele-vue-nest-dsfr` par défaut, voir `MODELE_VUE_NEST_DSFR`).

En cas de doute, une fois connecté : `http://localhost:5180/api/diagnostic` montre
l'installation (`all` / `selected`), les permissions accordées et la visibilité des modèles,
sans aucun secret.

## Limites connues

- Sessions en mémoire : un redémarrage de l'API déconnecte tout le monde (magasin persistant
  et jetons chiffrés avant toute mise en ligne).
- Jeton GitHub non renouvelé à expiration (8 h) : reconnexion nécessaire.
- Compte personnel gratuit + dépôt privé : la protection de `main` est refusée par GitHub ;
  l'interface le signale au PO.
