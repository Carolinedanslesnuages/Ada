# __NOM_PROJET__ — instructions pour les agents de code

Lu par Codex, OpenCode, Cursor, Copilot, Gemini CLI… ; `CLAUDE.md` l'importe pour Claude Code.

Objectif : __OBJECTIF__

## Conventions
- **Noms explicites** : chaque variable, fonction, paramètre ou classe dit ce qu'il contient
  ou fait, en toutes lettres et en français (`salleLibre`, `reservations_du_jour`), jamais `el`,
  `x`, `s`, `tmp`, `data2`. Seuls les noms imposés par les bibliothèques restent tels quels.
  Contrôlé par le lint côté front (`id-length`) ; la CI échoue sinon.
- API (`api/`) : Python 3.13, FastAPI. **Un module par domaine** (`app/<domaine>.py`, un
  `APIRouter` nommé `routes`), branché dans `app/main.py`. Routes sous `/api/<domaine>`,
  réponses JSON ; documentation interactive sur `/api/docs`.
- **Entrées et sorties typées** par des modèles Pydantic (`BaseModel`) : la validation est
  automatique et un champ inconnu est refusé (`model_config = ConfigDict(extra="forbid")`).
  Types partout : mypy en mode strict, la CI échoue sinon.
- **Erreurs** : codes HTTP justes, message clair en français
  (`raise HTTPException(status_code=404, detail="Réservation introuvable")`).
- **Base** : PostgreSQL, SQLAlchemy 2 (`app/base.py`, une session par requête via
  `Depends(session_base)`). **Toute évolution de la base = une migration Alembic**
  (`alembic revision --autogenerate -m "<sujet>"`, relue avant fusion), signalée pour relecture.
- Tests API : pytest (`api/tests/test_<domaine>.py`, client `TestClient`), réponses d'erreur comprises.
- Dépendances Python : versions figées dans `api/requirements.txt` (application) et
  `api/requirements-dev.txt` (outils) ; une nouvelle dépendance est justifiée dans la fiche.
- Front (`front/`) : Vue 3, un dossier `src/views/` par écran, appels API dans `src/services/`,
  `<script setup lang="ts">`. Jamais de `any`.
- **Pinia** (installé et activé dans `src/main.ts`) : créer un store `src/stores/<domaine>.ts`
  (syntaxe « setup store ») dès qu'une donnée sert à plusieurs écrans ou composants, doit
  survivre à un changement de page, ou est filtrée / modifiée à plusieurs endroits. Le store
  appelle les services ; les écrans lisent le store. Une donnée propre à un seul écran reste un
  `ref` local. Chaque store a ses tests (`src/stores/__tests__/`).
- Interface : composants DSFR (`Dsfr*` de `@gouvminint/vue-dsfr`), pas de HTML maison
  quand un composant existe. Un seul `h1` par page.
- Tout critère d'acceptation se traduit par au moins un test (pytest côté API, Vitest côté front).

## Accessibilité (RGAA) — les bases, toujours

Le service doit être utilisable par tous (RGAA 4, obligatoire dans l'administration). À chaque
écran ou composant, sans exception :

- **Composants DSFR** d'abord (`Dsfr*`) : ils sont déjà accessibles ; ne pas recoder un bouton,
  un champ ou une alerte en HTML maison. Ne jamais changer leurs couleurs (contrastes du DSFR).
- **Page** : `lang="fr"`, un titre de page (`<title>`) qui dit où l'on est, un seul `h1`, des
  titres `h2`, `h3`… sans saut de niveau ; liens d'évitement conservés.
- **Images** : alternative qui dit l'information (`alt="…"`), ou `alt=""` si décorative.
- **Formulaires** : chaque champ a une étiquette visible liée ; champs obligatoires signalés ;
  erreurs écrites en clair et reliées au champ (`DsfrInputGroup` avec `error-message`).
- **Clavier** : tout ce qui se fait à la souris se fait au clavier, dans un ordre logique, avec
  un focus visible ; jamais de `tabindex` positif ; un élément cliquable est un `<button>` ou un lien.
- **Liens et boutons** : intitulé compréhensible hors contexte (jamais « cliquez ici ») ; un lien
  qui ouvre une nouvelle fenêtre le dit.
- **Information** : jamais par la couleur seule (texte ou icône en plus) ; messages qui
  apparaissent sans rechargement annoncés (`role="status"` ou `aria-live`).
- **Tableaux de données** : un titre et des en-têtes de colonnes.
- **Animations** : respectent `prefers-reduced-motion`.

**Référentiel complet** (DINUM, RGAA 4.1.2, 106 critères et leurs tests) :
`ressources/accessibilite/rgaa-4.1.2/README.md` pour l'index, puis le fichier du thème concerné.

Vérifié automatiquement : le **lint** (`eslint-plugin-vuejs-accessibility`) refuse une image sans
alternative, un champ sans étiquette, un clic sans clavier… et chaque écran a un **test axe-core**
(`violationsAccessibilite`). Ces outils couvrent environ un tiers du RGAA : le reste se vérifie
à la main et se note dans la fiche de relecture (« à vérifier par un humain »).

## Commandes
| Action | Commande |
|---|---|
| Environnement Python | `cd api && python3.13 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt` |
| Base de données | `docker compose up -d` puis `cd api && alembic upgrade head` |
| Lancer l'API | `cd api && uvicorn app.main:app --reload` (port 8000, documentation : `/api/docs`) |
| Lancer le front | `cd front && npm run dev` (proxy `/api` vers le port 8000) |
| Tests | `cd api && pytest && cd ../front && npm run test:unit -- --run` |
| Lint | `cd api && ruff check . && ruff format --check . && cd ../front && npx oxlint . && npx eslint .` |
| Types / compilation | `cd api && mypy app && cd ../front && npm run type-check && npm run build-only` |

## Messages de commit (release-please)
Conventional Commits, versions SemVer calculées par release-please (jamais à la main) :
`fix: …` → correctif (0.2.0 → 0.2.1), `feat: …` → fonctionnalité (0.2.0 → 0.3.0),
`feat!: …` ou `BREAKING CHANGE:` → changement incompatible (majeure ; mineure avant 1.0.0),
`test:`, `docs:`, `chore:`, `refactor:` → sans nouvelle version. Fusion en squash : le
**titre de la PR** devient le commit de `main` (contrôle « Titre de PR » en CI). Story issue
d'une issue GitHub : `Closes #<numéro>` dans le corps.

## Règles absolues
- **Un fichier, une responsabilité** : au plus 400 lignes non vides par fichier de code, 600 par fichier de test (contrôle « Taille des fichiers » en CI). Découper par responsabilité, jamais une fonction par fichier ; un fichier déjà trop long ne grossit plus.
- Ne jamais modifier `.github/`.
- Aucune donnée réelle, aucun secret dans le dépôt (gitleaks bloque en CI, et en local une fois `pre-commit install` lancé ; `--no-verify` interdit).
- Une branche par story (`story/…`) ou par bug (`fix/…`) ; jamais de fusion par l'agent.
- Les décisions d'architecture sont tracées dans `docs/adr/`.
