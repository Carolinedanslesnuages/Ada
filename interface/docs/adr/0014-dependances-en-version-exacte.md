# ADR-0014 — Dépendances des projets en version exacte, vérifiées par Madeleine

- **Statut** : Accepted
- **Date** : 2026-11-22
- **Décideurs** : responsable d'ADA
- **Sujet** : dépendances npm ajoutées aux projets, notamment par l'assistant de code

## Contexte
L'assistant de code ajoute des dépendances sans relecture d'un développeur. Il peut citer un
paquet qui n'existe pas (et qu'un tiers pourrait publier sous ce nom), prendre une version publiée
la veille, ou une licence incompatible. Les modèles déclaraient leurs dépendances en plage
(`^1.2.3`) : deux installations pouvaient différer.

## Décision
- Les dépendances npm des modèles sont **figées sur la version de leur verrou**
  (`package-lock.json`) ; un `.npmrc` (`save-exact=true`) dans chaque dossier npm garde des
  versions exactes à chaque `npm install`. `verifier-modele.mjs` refuse une version non exacte.
- Le socle ajoute le contrôle **« Dépendances (paquet réel, version exacte, licence) »**
  (`dependances.yml`), exigé avant fusion, fourni par
  [Madeleine](https://github.com/Carolinedanslesnuages/madeleine) et épinglé à un SHA. Il ne juge
  que les dépendances ajoutées ou modifiées par la PR.
- Exceptions écrites dans `madeleine.json` du socle : licences d'`axe-core` (MPL-2.0, tests
  d'accessibilité) et du DSFR (licence propre).

## Conséquences
- **Positives** : installations identiques partout ; un paquet inventé ou trop récent bloque la PR,
  avec une annotation qui dit quoi faire.
- **Négatives** : une mise à jour de dépendance se fait explicitement, version par version ; une
  version de moins de 14 jours attend.
- **À surveiller** : ESLint 9 (API de trois modèles) est signalé comme déprécié ; il bloquera la
  première PR qui le modifie sans passer à ESLint 10.
