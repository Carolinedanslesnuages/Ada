# ADA — interface web

L'interface de développement no-code d'ADA : sans écrire de code, l'utilisateur crée ses
projets, écrit ses stories et signale des problèmes ; l'aperçu du produit s'affiche à côté. Consignes pour les agents de code : [AGENTS.md](AGENTS.md).
Décisions : [docs/adr/](docs/adr/README.md).

## Installer et lancer ADA (pas à pas)

Pour quelqu'un qui part de zéro, sur sa propre machine. Comptez une demi-heure. Votre ADA sera
**indépendante** de celle des autres : ses projets se créent sur **votre** compte GitHub, et ses
données locales (aperçus, journal des demandes, indicateurs) restent sur votre machine.

### 1. Prérequis

| Outil | Pourquoi | Vérifier |
|---|---|---|
| **Node.js 24** (22.18 au minimum) | API et interface | `node --version` |
| **Docker**, en marche, avec `docker compose` | l'aperçu de chaque projet tourne dans un conteneur | `docker compose version` |
| **git** | clones des projets | `git --version` |
| **Claude Code** (l'agent), connecté à un compte | c'est lui qui analyse et code ; voir l'étape 4 | `claude --version` |
| un **compte GitHub** | ADA s'y connecte et y crée vos projets | |

Facultatif, pour contribuer à ADA : [pre-commit](https://pre-commit.com) (anti-fuite gitleaks avant chaque commit).

### 2. Cloner ADA

```bash
git clone --recurse-submodules https://github.com/Carolinedanslesnuages/ada.git
cd ada   # (déjà cloné sans l'option ? git submodule update --init)
pre-commit install        # facultatif : bloque un secret avant qu'il soit commité
```

Tout est dans ce dépôt : les skills, les modèles de projet (`catalogue/`) et l'interface (`interface/`).

### 3. Créer votre GitHub App

Suivez la section [Mise en place de la GitHub App](#mise-en-place-de-la-github-app-une-fois)
ci-dessous : création, identifiants, **installation sur votre compte** (indispensable).

### 4. L'agent de code

ADA lance l'agent elle-même, en mode non interactif, avec la commande indiquée dans `AGENT_COMMANDE`.
Elle attend les options et la sortie de **Claude Code**.

- Installez Claude Code (voir sa documentation), puis lancez `claude` une fois dans un terminal pour
  vous connecter (abonnement ou clé d'API). `AGENT_COMMANDE=claude` suffit alors.
- Vous utilisez seulement l'extension VS Code ? Son exécutable change de dossier à chaque mise à
  jour : créez un petit lanceur (par exemple `~/.local/bin/claude-ada`) qui retrouve la dernière
  version dans `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude`, et
  mettez son chemin **complet** dans `AGENT_COMMANDE` (`/Users/vous/…` : « ~ » n'y est pas remplacé).
- Sans agent (`AGENT_COMMANDE` vide), ADA s'ouvre, mais ne lance aucune demande.

L'agent ne lit que **vos réglages d'utilisateur** de Claude Code, jamais ceux d'un projet, et
ne reçoit aucun secret d'ADA.

### 5. Les skills de l'assistant (recommandé)

Rien à faire : les skills externes sont livrées avec ADA (sous-modules git de `skills/externes/`) et
`AGENT_SKILLS` les vise par défaut. Voir [Skills de l'assistant](#skills-de-lassistant).

### 6. Configurer

```bash
cd interface/api
cp .env.example .env
openssl rand -hex 32      # à coller dans SESSION_SECRET
```

Dans `api/.env`, au minimum : `GITHUB_PROPRIETAIRE` (votre compte), `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, `AGENT_COMMANDE`. Pour laisser d'autres comptes se
connecter à **votre** ADA : `LOGINS_AUTORISES` (votre App doit aussi être installée sur leur compte).
Ce fichier contient des secrets : il est ignoré par git, ne le partagez jamais.

### 7. Installer et lancer

```bash
# terminal 1 : l'API (port 3100)
cd interface/api && npm ci && npm run start:dev

# terminal 2 : l'interface (port 5180)
cd interface/front && npm ci && npm run dev
```

Ouvrez <http://localhost:5180>, connectez-vous avec GitHub, puis créez un projet.

### 8. Vérifier

- **Une fois connecté,** <http://localhost:5180/api/diagnostic> montre l'installation de l'App, ses
  permissions et les modèles disponibles, sans aucun secret.
- **Premier projet :** ADA crée le dépôt sur votre compte, protège sa branche principale et démarre son
  aperçu (le premier démarrage installe les dépendances : quelques minutes).
- **L'agent, sans rien écrire sur GitHub :** depuis la racine du dépôt,
  `cd interface/api && npm run build && cd ../..`, puis `node scripts/banc-agent/analyse.mjs --a-blanc`
  (voir `scripts/banc-agent/README.md` pour le banc complet, qui consomme des appels à l'agent).

### Mettre à jour

```bash
git pull
(cd interface/api && npm ci) && (cd interface/front && npm ci)   # si les dépendances ont changé
```

En mode développement (`start:dev`, `npm run dev`), l'API et l'interface rechargent seules le
nouveau code. Avant de mettre à jour, vérifiez qu'aucun agent ne travaille (`pgrep -f "claude -p"`).

### Essayer un autre modèle que Claude (non testé)

ADA garde Claude Code comme agent, mais Claude Code peut parler à un autre modèle par une
adresse compatible avec l'API d'Anthropic. C'est le cas, par exemple, de GLM, chez Zhipu (Z.ai).
Un lanceur fixe `ANTHROPIC_BASE_URL` (l'adresse donnée par le fournisseur), `ANTHROPIC_AUTH_TOKEN` (sa
clé, jamais dans le dépôt), puis lance `claude`. Le nom du modèle va dans `AGENT_MODELE`.

- **Qualité à vérifier :** passez le banc d'essai (`BANC_COMMANDE`, `BANC_MODELE`) et comparez avec Claude
  avant tout usage réel. Le point fragile est le respect des consignes et du format de réponse.
- **Données :** le code des projets et les échanges partent chez ce fournisseur. Décidez-en avec
  votre équipe.
- **Empreinte carbone :** l'estimation d'ADA suppose la taille de modèles connus ; pour un autre
  modèle, elle est approximative.

## Mise en place de la GitHub App (une fois)

1. **Créer l'App** : GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
   - Homepage URL : `http://localhost:5180`
   - Callback URL : `http://localhost:5180/api/auth/github/callback`
   - Expire user authorization tokens : coché
   - Webhook → Active : **décoché**
   - Permissions de dépôt : Contents, Issues, Pull requests, Workflows, Administration,
     Repository creation : *Read and write* ; Actions, Checks, Commit statuses, Metadata : *Read-only*
   - Where can this GitHub App be installed : *Any account* (chaque personne crée ses projets sur
     son propre compte). App déjà créée en *Only on this account* : page de l'App → **Advanced** →
     *Danger zone* → **Make public**. Seuls les comptes de `LOGINS_AUTORISES` se connectent à ADA.
2. **Récupérer les identifiants** (page de l'App, onglet General) : *Client ID*, puis
   *Generate a new client secret* (40 caractères hexadécimaux, affiché une seule fois — pas la
   section *Private keys*). Les mettre dans `api/.env` (modèle : `api/.env.example`).
3. **Installer l'App, pour chaque personne** — étape indispensable, distincte de l'autorisation :
   page publique de l'App → **Install** → **son propre compte** → **All repositories**. ADA crée
   les nouveaux projets sur le compte GitHub de la personne connectée, jamais sur celui qui a
   configuré ADA. Sans installation, l'App est autorisée à agir au nom de la personne mais ne voit
   aucun de ses dépôts : la création de projet échoue (ADA explique quoi faire).

Aucun dépôt modèle à créer sur GitHub : les modèles de projet vivent dans ce dépôt, dans
`catalogue/<modèle>/` (voir `docs/adr/0006`). Un type de projet n'est proposé à l'utilisateur que si son
dossier est livré avec son `ada.json`. Les fichiers communs à tous les projets sont dans
`catalogue/socle/`, copié avant le modèle (voir `docs/adr/0013`).

En cas de doute, une fois connecté : `http://localhost:5180/api/diagnostic` montre
l'installation (`all` / `selected`), les permissions accordées et les modèles disponibles,
sans aucun secret.

## Mon modèle (modèle de langage de l'utilisateur)

La page **Mon modèle** (menu en haut à droite) permet à chaque utilisateur de faire travailler ADA avec **son** modèle :
adresse d'une passerelle compatible OpenAI, clé d'API et nom du modèle. Un bouton **Tester la connexion** vérifie
l'adresse, la clé et surtout que le modèle sait appeler des outils (sinon l'agent explique au lieu d'agir).
Sans réglage, ADA utilise `AGENT_COMMANDE` / `AGENT_MODELE`. Chaque demande indique dans son fil le modèle utilisé.

- La clé est **chiffrée** (AES-256-GCM, clé dérivée de `SESSION_SECRET`) dans `DOSSIER_MODELES`, par utilisateur ; elle
  n'est jamais renvoyée à l'écran (seulement ses 4 derniers caractères), ni écrite dans un journal ou une option de commande.
  L'agent la reçoit par son environnement, et les commandes qu'il lance ne la voient pas. Changer `SESSION_SECRET` rend les
  clés enregistrées illisibles : chacun doit les ressaisir.
- Ces utilisateurs passent par l'agent `agent-openai/` (voir son README), jamais par les réglages de l'administrateur : ni sa
  clé, ni ses profils ne peuvent partir vers une adresse saisie par quelqu'un d'autre.
- **Adresses acceptées : https uniquement**, et jamais une adresse locale ou interne (localhost, réseaux privés ou partagés,
  adresses de métadonnées du cloud, IPv4 cachée en IPv6), car c'est le serveur qui appelle l'adresse saisie. Un nom de
  domaine doit se résoudre vers des adresses publiques seulement, et une redirection de la passerelle n'est jamais suivie.
  Limite connue : la résolution peut changer après la vérification (rebinding DNS) ; seule une règle réseau sur le serveur
  l'empêche vraiment. Un modèle qui tourne sur un poste (Ollama) n'est
  donc pas joignable par ce biais. Aucune liste de domaines autorisés : toute passerelle publique en https convient.

## Skills de l'assistant

ADA relie dans chaque projet, avant chaque exécution, les skills listées dans `AGENT_SKILLS`
(`.claude/skills/` et `.agents/skills/`, exclus localement de git : rien n'est commité).
Les skills externes sont **livrées avec ADA, sans copie** : le dépôt contient des sous-modules git, figés à
un commit précis, dans `skills/externes/` (indépendants du poste de chacun, donc présents aussi en ligne) :

| Sous-module | Dépôt | Licence |
|---|---|---|
| `skills/externes/dsfr-skill` | [numerique-gouv/dsfr-skill](https://github.com/numerique-gouv/dsfr-skill) (DINUM) | Licence ouverte 2.0 |
| `skills/externes/agent-skills` | [IA-Generative/agent-skills](https://github.com/IA-Generative/agent-skills) | non précisée : d'où des références, pas des copies |

`AGENT_SKILLS` les vise par défaut (chemins relatifs à `interface/api`) ; le renseigner remplace la liste, et le
laisser vide (`AGENT_SKILLS=`) retire toutes les skills. Une skill introuvable (sous-modules non récupérés) est
signalée dans le journal de l'API : `git submodule update --init`. Les skills `po-*` d'ADA sont, elles, dans `skills/po/`.
Mettre à jour une skill externe : `git -C skills/externes/<nom> pull`, puis committer le nouveau commit dans ADA.
Un serveur ou une CI qui clone ADA doit récupérer les sous-modules (`--recurse-submodules`, ou `submodules: recursive`).

Skills reliées : `dsfr-skill` (composants et pages DSFR), `bug-investigate` (problèmes
signalés), `repo-perimetre` (avant de livrer), `controle-qualite-code` (relecture). Avec l'isolement actuel (`--setting-sources user`), l'outil
Skill de l'agent ne voit pas ces skills : la consigne lui indique de lire leur `SKILL.md` au bon moment
(`.claude/skills/<nom>/`), et le banc d'essai compte ces lectures. Leur apport n'est pas encore mesuré.

**Cloisonnement** : l'agent ne lit et n'écrit que dans le projet (règles `Read(./**)`,
`Edit(./**)`…), plus la lecture des dossiers des skills. ADA écarte toute skill qui pré-autorise
des outils (`allowed-tools`) ou exécute des commandes au chargement (c'est le cas d'`adr-new`).

## Sécurité et fiabilité

- **Cloisonnement de l'agent** : lecture et écriture limitées au projet, plus la lecture des
  dossiers de skills ; skills qui pré-autorisent des outils écartées ; **jamais de modification
  de `.github/` ni de `charts/`** (CI, versions, déploiement) ; aucun accès à GitHub (ADA publie
  à la place du PO) ; seuls les réglages de l'utilisateur du serveur sont lus, sans les secrets d'ADA.
- **Aperçu isolé** : le dossier git d'un projet est rangé hors du dépôt monté dans le conteneur.
- **Confiance** : seuls les auteurs qui ont le droit d'écrire dans le projet comptent ; une issue
  écrite par un inconnu ne se lance pas.
- **Processus travailleur** : chaque tâche de l'assistant tourne dans un processus détaché qui
  survit aux redémarrages de l'API ; un agent à la fois par projet (verrou qui « bat » toutes les
  30 secondes, `apercus/<projet>/agent/verrou.json`), au plus `AGENT_MAX_SIMULTANES` sur la
  machine, les suivants en file d'attente.
- **Fusion** : seulement contrôles verts, et refusée si la branche a avancé en dehors d'ADA ; une
  demande en retard sur `main` est mise à jour (contrôles relancés) avant fusion.
- **Protection de `main`** : posée par ADA sur un projet qu'elle crée, proposée au PO sur un projet repris.
- **Un fichier, une responsabilité** : contrôle « Taille des fichiers » dans ADA et chaque projet (`docs/adr/0012`).
- **Retirer un projet d'ADA** (bouton dans l'atelier) n'efface rien sur GitHub : seul son topic part.
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

## Pourquoi les échanges sont recopiés dans GitHub

Chaque demande est une issue, et chaque échange avec l'assistant (questions, réponses du PO,
accord sur le plan) y est **recopié** en commentaire, au nom du PO. C'est voulu : la trace de qui
a demandé et validé quoi (du code est écrit par une IA), un contexte complet pour un développeur
qui reprend, et un historique qui appartient au projet plutôt qu'à l'outil (`docs/adr/0009`).

Mais **ADA ne relit pas GitHub pour décider** (`docs/adr/0011`) : elle fige la demande au lancement
et tient son propre journal des échanges, faits dans son interface. Un commentaire, un label ou
une modification écrits directement sur GitHub ne parviennent ni à l'agent ni au statut ; ADA
signale seulement au PO qu'il y en a, pour qu'il les recopie dans ADA s'il le souhaite.
