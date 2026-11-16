# ADA — interface web

L'interface de développement no-code d'ADA : sans écrire de code, l'utilisateur crée ses
projets, écrit ses stories et signale des problèmes ; l'aperçu du produit s'affiche à côté. Consignes pour les agents de code : [AGENTS.md](AGENTS.md).
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
   est autorisée à agir au nom de l'utilisateur mais ne voit aucun dépôt : la création de projet échoue.

Aucun dépôt modèle à créer sur GitHub : les modèles de projet vivent dans ce dépôt, dans
`catalogue/<modèle>/` (voir `docs/adr/0006`). Un type de projet n'est proposé à l'utilisateur que si son
dossier est livré avec son `ada.json`.

En cas de doute, une fois connecté : `http://localhost:5180/api/diagnostic` montre
l'installation (`all` / `selected`), les permissions accordées et les modèles disponibles,
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
  dossiers de skills ; skills qui pré-autorisent des outils écartées ; **jamais de modification
  de `.github/`** (workflows de CI et de versions).
- **Processus travailleur** : chaque tâche de l'assistant tourne dans un processus détaché qui
  survit aux redémarrages de l'API ; verrou par projet (`apercus/<projet>/agent/verrou.json`).
- **Fusion** : une demande en retard sur `main` est mise à jour (contrôles relancés) avant fusion.
- **Sessions** chiffrées sur disque ; **jeton GitHub** renouvelé en silence avant expiration.

## Limites connues

- Compte personnel gratuit + dépôt privé : la protection de `main` est refusée par GitHub ;
  l'interface le signale à l'utilisateur.
- PR de version (release-please) : leurs contrôles attendent une approbation manuelle sur GitHub,
  car ouvertes par le robot GitHub. Sans conséquence : ADA ne publie une version que si la PR
  ne touche que les fichiers de version. Décision et montage prévu en organisation : ADR-0005.

## Liens de démonstration (ADA en ligne)

Le bouton « Copier le lien de démonstration » (panneau Aperçu) démarre, à la demande, une seconde
instance du projet sur sa **dernière version validée** (branche `main`), jamais sur le travail en
cours de l'assistant. Elle a ses propres données et un port de la plage 5400-5499, sur
127.0.0.1. Elle est mise à jour après chaque « Valider et fusionner ».

`URL_DEMO` (`api/.env`) donne l'adresse publique partagée, `{projet}` et `{port}` remplacés :

- en local (par défaut) : `http://localhost:{port}` ;
- en ligne : par exemple `https://{projet}.demo.ada.gouv.fr`, avec un proxy (domaine générique
  `*.demo.ada.gouv.fr`, certificat compris) qui renvoie chaque sous-domaine vers le port de sa démo.
  ADA autorise cet hôte dans le serveur de l'application ; les autres restent refusés.

Le lien s'ouvre sans compte : c'est acceptable parce qu'un projet ne contient que des données
fictives (règle d'ADA). Un POC qui doit être protégé ajoute sa propre connexion.

## Pourquoi les échanges sont dans GitHub

Le prompt du mode libre devient une issue, et chaque échange avec l'assistant (questions,
réponses du PO, accord sur le plan) un commentaire de l'issue, au nom du PO. C'est voulu : la
trace de qui a demandé et validé quoi (du code est écrit par une IA), un historique que
l'assistant relit à chaque reprise, un contexte complet pour un développeur qui reprend, et un
historique qui appartient au projet plutôt qu'à l'outil. Détails : `docs/adr/0009`.
