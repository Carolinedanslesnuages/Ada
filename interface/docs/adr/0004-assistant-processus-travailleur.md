# ADR-0004 — L'assistant tourne dans un processus travailleur détaché

- **Statut** : Accepted
- **Date** : 2026-11-16
- **Décideurs** : équipe ADA
- **Sujet** : où s'exécute le travail de l'assistant (analyse, réalisation)

## Contexte
L'assistant était un sous-processus de l'API : un redémarrage de l'API (mise à jour, panne,
mode développement) l'interrompait en pleine réalisation, laissant un travail à moitié écrit.
C'est arrivé le 2026-11-16 sur une story réelle.

## Options considérées
### Option A — Processus travailleur détaché, un par tâche
- Survit aux redémarrages de l'API ; fait tout le cycle (agent, issue, push, PR).
- Verrou par projet sur disque (numéro de processus) : une demande à la fois, entre processus.
### Option B — File de messages (Redis, BullMQ) et un service de travailleurs
- **Pourquoi pas maintenant** : une brique de plus à héberger pour un usage encore local.
### Option C — Garder le sous-processus et interdire les redémarrages pendant le travail
- **Pourquoi pas** : une panne ou une mise à jour reste possible ; la règle ne protège rien.

## Décision
**Option A.** La tâche (dont le jeton du PO) est transmise par un fichier lisible par le seul
utilisateur, supprimé dès sa lecture. Un verrou tenu par un processus mort est ignoré, et la
reprise d'un travail interrompu sur la même branche est prévue.

## Conséquences
- **Positives** : redémarrer l'API n'interrompt plus personne ; journal par tâche
  (`agent/<numéro>.travailleur.log`).
- **Négatives** : plusieurs processus à superviser ; le jeton passe brièvement par le disque.
- **À surveiller** : au-delà de quelques PO simultanés, passer à l'option B (file d'attente).
