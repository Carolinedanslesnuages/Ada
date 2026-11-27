# Décisions d'architecture (ADR)

| N° | Titre | Statut | Date |
|---|---|---|---|
| [0001](0001-github-source-de-verite.md) | GitHub comme source de vérité des stories | Accepted | 2026-11-16 |
| [0002](0002-apercu-conteneur-par-projet.md) | Aperçu en direct : un conteneur par projet | Accepted | 2026-11-16 |
| [0003](0003-connexion-github-app.md) | Connexion par GitHub App, au nom du PO, avec liste blanche | Accepted | 2026-11-16 |
| [0004](0004-assistant-processus-travailleur.md) | L'assistant tourne dans un processus travailleur détaché | Accepted | 2026-11-16 |
| [0005](0005-ci-des-versions.md) | Contrôles des PR de version : ni approbation automatique, ni clé dans les projets | Accepted | 2026-11-16 |
| [0006](0006-modeles-dans-le-depot-ada.md) | Les modèles de projet vivent dans le dépôt d'ADA | Accepted | 2026-11-16 |
| [0007](0007-releases-fabnum-cicd.md) | Versions par le workflow commun de la DNUM (fabnum-cicd) | Accepted | 2026-11-16 |
| [0008](0008-deploiement-des-projets.md) | Déploiement des projets : image Docker toujours, chart Helm sur demande | Accepted | 2026-11-16 |
| [0009](0009-echanges-enregistres-dans-github.md) | Les échanges avec l'assistant sont enregistrés dans GitHub | Accepted | 2026-11-16 |
| [0010](0010-reprise-et-proprietaire-par-projet.md) | Reprise d'un projet existant : un propriétaire par projet, une PR de reprise | Accepted | 2026-11-17 |
| [0011](0011-etat-des-demandes-dans-ada.md) | L'état et la conversation d'une demande vivent dans ADA ; GitHub en reçoit une copie | Accepted | 2026-11-18 |
| [0012](0012-un-fichier-une-responsabilite.md) | Un fichier, une responsabilité, vérifié en CI dans ADA et dans chaque projet | Accepted | 2026-11-19 |
| [0013](0013-socle-commun-des-modeles.md) | Un socle commun aux modèles, des contrôles communs fournis par Constance | Accepted | 2026-11-21 |
| [0014](0014-dependances-en-version-exacte.md) | Dépendances des projets en version exacte, vérifiées par Madeleine | Accepted | 2026-11-22 |
| [0015](0015-accessibilite-des-pages-construites.md) | Accessibilité des pages construites, vérifiée par Emmanuelle | Accepted | 2026-11-22 |
| [0016](0016-ada-utilise-les-controles-de-ses-projets.md) | ADA passe les mêmes contrôles que ses projets | Accepted | 2026-11-22 |
| [0017](0017-mon-modele-par-utilisateur.md) | Chaque utilisateur peut faire travailler ADA avec son propre modèle | Accepted | 2026-11-25 |
| [0018](0018-skills-externes-en-sous-modules.md) | Les skills externes sont livrées avec ADA, en sous-modules git | Accepted | 2026-11-25 |
| [0019](0019-ci-par-les-workflows-de-la-fabnum.md) | Les contrôles d'ADA et de ses projets passent d'abord par les outils de la Fabnum | Accepted | 2026-11-27 |
| [0020](0020-skills-fabnum-pour-l-agent.md) | L'agent reçoit les conventions de la Fabnum et les skills de sécurité et RGAA de la DINUM | Accepted | 2026-11-27 |
| [0021](0021-images-separees-vue-fastapi.md) | Le modèle `vue-fastapi` se déploie comme les projets de l'organisation | Accepted | 2026-11-27 |
| [0022](0022-code-en-anglais.md) | Le code d'ADA est en anglais ; seuls les textes affichés restent en français | Accepted | 2026-11-27 |
