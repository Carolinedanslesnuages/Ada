# ADR-0013 — Un socle commun aux modèles, des contrôles communs fournis par Constance

- **Statut** : Accepted
- **Date** : 2026-11-21
- **Décideurs** : responsable d'ADA
- **Sujet** : fichiers communs à tous les modèles du catalogue, et origine des contrôles communs des projets

## Contexte
Chaque modèle de `catalogue/` portait sa propre copie des fichiers communs : modèles d'issues,
workflows (titre de PR, taille des fichiers, anti-fuite, versions), `.gitleaks.toml`,
pre-commit, release-please, `CLAUDE.md`, référentiel RGAA. Dix-huit copies divergent : un audit
du 2026-11-21 a trouvé le référentiel RGAA resté dans `docs/` alors que les `AGENTS.md` le
cherchaient dans `ressources/` (#119), un `CLAUDE.md` vide (traitement-python), et la route de
version absente de trois modèles.

## Options considérées
### Option A — Socle commun copié avant le modèle
- Un seul exemplaire des fichiers communs ; les modèles restent des projets complets, vérifiés
  en CI avant qu'un PO ne s'en serve.
### Option B — Script qui génère le projet à partir de rien
- **Pourquoi pas** : le résultat dépendrait des versions publiées le jour de la création, ne
  pourrait plus être vérifié d'avance, et demanderait le réseau à chaque création.

## Décision
**Option retenue : A.**
- `catalogue/socle/` contient les fichiers communs. À la création, ADA copie le socle puis le
  modèle, qui **remplace** un fichier du socle quand il en a besoin (formulaires propres à une
  API, configuration release-please de l'extension). Pas d'`ada.json` : ce n'est pas un modèle.
- `verifier-modele.mjs` refuse un fichier de modèle identique à celui du socle : une copie à
  l'identique finirait par diverger.
- La reprise d'un projet existant prend ses fichiers dans le modèle de la stack indiquée, sinon
  dans le socle.
- Les contrôles **anti-fuite**, **titre de PR** et **taille des fichiers** des projets utilisent
  les actions de [Constance](https://github.com/Carolinedanslesnuages/constance), épinglées à un
  SHA (vérifié par `check.yml`). Mêmes noms de contrôle qu'avant : la protection de `main` des
  projets existants reste valable. ADA garde ses propres workflows.
- Le référentiel RGAA du socle est identique à celui de la skill `po-story` (vérifié par `check.yml`).

## Conséquences
- **Positives** : une règle commune se change à un seul endroit ; les écarts de l'audit sont
  corrigés pour tous les modèles ; les contrôles s'améliorent avec Constance (avertissement avant
  la limite, suggestion de titre, fichiers renommés suivis).
- **Négatives** : les projets dépendent d'actions publiées hors de l'organisation ; une nouvelle
  version de Constance demande de changer le SHA du socle. Les projets déjà créés gardent leurs
  anciens workflows.
- **À surveiller** : un modèle qui remplace beaucoup de fichiers du socle signale un socle mal découpé.
- Modifie [ADR-0012](0012-un-fichier-une-responsabilite.md) : le workflow de taille des fichiers
  des projets vient du socle, et n'est plus identique à celui d'ADA.
