# ADA — interface web

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

## Skills de l'assistant

ADA relie dans chaque projet, avant chaque exécution, les skills listées dans `AGENT_SKILLS`
(`.claude/skills/` et `.agents/skills/`, exclus localement de git : rien n'est commité).
Installation recommandée, à l'emplacement prévu par leurs auteurs :

```bash
git clone https://github.com/numerique-gouv/dsfr-skill.git ~/.local/share/dsfr-skill     # DINUM, licence ouverte 2.0
git clone https://github.com/IA-Generative/agent-skills.git ~/.local/share/agent-skills  # IA-Generative
```

Skills utilisées : `dsfr-skill` (composants et pages DSFR), `bug-investigate` (problèmes
signalés), `repo-perimetre` (avant de livrer), `controle-qualite-code` (relecture). Mise à jour :
`git -C ~/.local/share/<catalogue> pull`.

**Cloisonnement** : l'agent ne lit et n'écrit que dans le projet (règles `Read(./**)`,
`Edit(./**)`…), plus la lecture des dossiers des skills. ADA écarte toute skill qui pré-autorise
des outils (`allowed-tools`) ou exécute des commandes au chargement (c'est le cas d'`adr-new`).

## Sécurité et fiabilité

- **Cloisonnement de l'agent** : lecture et écriture limitées au projet, plus la lecture des
  dossiers de skills ; skills qui pré-autorisent des outils écartées.
- **Processus travailleur** : chaque tâche de l'assistant tourne dans un processus détaché qui
  survit aux redémarrages de l'API ; verrou par projet (`apercus/<projet>/agent/verrou.json`).
- **Fusion** : une demande en retard sur `main` est mise à jour (contrôles relancés) avant fusion.
- **Sessions** chiffrées sur disque ; **jeton GitHub** renouvelé en silence avant expiration.

## Limites connues

- Compte personnel gratuit + dépôt privé : la protection de `main` est refusée par GitHub ;
  l'interface le signale au PO.
- PR de version (release-please) : leurs contrôles attendent une approbation manuelle sur GitHub,
  car ouvertes par le robot GitHub. Sans conséquence : ADA ne publie une version que si la PR
  ne touche que les fichiers de version. Les faire tourner seules demande une clé privée de la
  GitHub App et un secret par dépôt (à mettre en place avec l'hébergement).
