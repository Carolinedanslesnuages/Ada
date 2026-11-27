# ADR-0022 — Le code d'ADA est en anglais ; seuls les textes affichés restent en français

- **Statut** : Accepted
- **Date** : 2026-11-27
- **Décideurs** : responsable d'ADA
- **Sujet** : la langue du code de l'interface (API et front), de ses données et de ses adresses

## Contexte
Les conventions de la Fabnum demandent des noms en anglais (`transversal-doc`, « Nommage »). Le
code d'ADA était en français : identifiants, fichiers, commentaires, intitulés de tests, routes,
champs JSON, variables d'environnement. ADA doit suivre les conventions qu'elle fait suivre aux
projets qu'elle crée (ADR-0019, ADR-0020).

## Options considérées
### A — Ne traduire que le code interne
- Routes, champs JSON, `ada.json`, variables d'environnement et fichiers enregistrés restent en
  français : aucune migration.
- **Pourquoi pas** : les types partagés entre l'API et le front garderaient des champs français,
  et la règle aurait autant d'exceptions que de formats.
### B — Tout traduire, et lire l'ancien format
- Tout ce qui est du code passe en anglais, formats compris ; ce qui a été écrit avant reste lu.

## Décision
**Option B.**
- **En anglais** : identifiants, noms de fichiers, commentaires, intitulés de tests, messages de
  journalisation, routes de l'API (`/api/projects/:repository/stories/:number`), adresses des
  pages (`/sign-in`, `/indicators`, `/model`), champs JSON, valeurs d'état (`in-progress`,
  `plan-to-approve`…), clés et types de projet d'`ada.json`, variables d'environnement
  (`GITHUB_OWNER`, `PREVIEWS_DIR`…), classes CSS et identifiants HTML.
- **En français** : ce que lit une personne, c'est-à-dire les textes de l'interface, les messages
  d'erreur renvoyés à l'écran, les consignes données à l'agent, ce qu'ADA écrit sur GitHub
  (labels, commentaires, titres), la documentation, les commits.
- **Ancien format lu à la volée**, sans migration à lancer, dans trois fichiers qui sont les seuls
  à garder des noms français : `api/src/ada/legacy-ada-json.ts` (`ada.json` des projets déjà
  créés), `api/src/legacy/legacy-storage.ts` (demandes, activité, registre, empreinte, sessions,
  modèles personnels) et `api/src/legacy/legacy-env.ts` (variables d'environnement). ADA écrit
  désormais le nouveau format.

## Conséquences
- Un `.env` existant continue de marcher ; `api/.env.example` donne les nouveaux noms.
- Les liens déjà partagés vers `/connexion`, `/indicateurs` ou `/modele` ne marchent plus.
- **Ce qui ne change pas ici**, parce que le renommer toucherait des aperçus en cours et leurs
  données : les noms des dossiers et fichiers sur le disque (`apercus/<projet>/depot`,
  `demandes/1.statut.json`, `registre/projets.json`…) et ceux des ressources Docker (projets
  `apercu-…`, volumes `atelier-po-cache-…`). Seul leur contenu est lu dans les deux formats.
- Les modèles du catalogue et les scripts de vérification restent à traduire (ADR à compléter).
- Une branche de travail en cours garde son nom (`libre/…`) ; les nouvelles s'appellent `free/…`.
