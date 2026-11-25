# ADR-0018 — Les skills externes sont livrées avec ADA, en sous-modules git

- **Statut** : Accepted
- **Date** : 2026-11-25
- **Décideurs** : responsable d'ADA
- **Sujet** : où vivent `dsfr-skill` et les skills d'agent-skills

## Contexte
`AGENT_SKILLS` demandait des chemins complets vers deux clones faits à la main sur chaque
poste (`~/.local/share/…`). Une installation en ligne, ou le poste d'une autre personne, tournait
sans ces skills sans que rien ne le signale clairement.

## Décision
- `dsfr-skill` (DINUM) et `agent-skills` (IA-Generative) sont des **sous-modules git** de
  `skills/externes/`, figés à un commit précis. Ce sont des références : rien n'est copié dans ADA.
- `AGENT_SKILLS` les prend par défaut (chemins relatifs à `interface/api`) ; le renseigner remplace
  la liste, `AGENT_SKILLS=` la vide. Une skill introuvable est signalée dans le journal.
- Une CI qui lance les tests de l'API récupère les sous-modules (`submodules: true`) : un test
  vérifie que les skills par défaut sont bien présentes.
- Le banc d'essai de l'agent prend les mêmes skills par défaut que l'API.

## Conséquences
- **Positives** : mêmes skills, aux mêmes versions, sur tous les postes et en ligne ; une mise à jour
  se voit dans l'historique d'ADA.
- **Négatives** : un clone sans `--recurse-submodules` n'a pas les skills (`git submodule update --init`).
  Le dépôt `agent-skills` ne précise pas sa licence : ADA le référence, ne le copie pas.
