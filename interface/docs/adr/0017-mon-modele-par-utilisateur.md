# ADR-0017 — Chaque utilisateur peut faire travailler ADA avec son propre modèle

- **Statut** : Accepted
- **Date** : 2026-11-25
- **Décideurs** : responsable d'ADA
- **Sujet** : modèle de langage de l'agent, par utilisateur

## Contexte
ADA lançait un seul agent, réglé par l'administrateur (`AGENT_COMMANDE`, `AGENT_MODELE`). Les
utilisateurs n'ont pas tous accès au même modèle : un prestataire utilise un modèle du marché, un
agent d'une administration une passerelle interne. Demander à l'administrateur de régler chaque
poste ne passe pas à l'échelle, et lui confier la clé de chacun est un risque.

## Décision
- Une page **Mon modèle** : chaque utilisateur renseigne l'adresse d'une passerelle compatible
  OpenAI, sa clé et le nom du modèle, et peut tester la connexion (le modèle sait-il appeler des outils ?).
- Ces utilisateurs passent par l'agent livré avec ADA (`api/agent-openai/`), qui reprend les options
  de Claude Code et écrit la même sortie : le reste d'ADA ne change pas. Sans réglage personnel,
  ADA garde l'agent de l'administrateur.
- La clé est chiffrée (AES-256-GCM, clé dérivée de `SESSION_SECRET`), un fichier par utilisateur,
  jamais renvoyée à l'écran, jamais passée en option de commande ; l'agent la reçoit par son
  environnement et les commandes qu'il lance ne la voient pas. La clé enregistrée ne part que vers
  l'adresse pour laquelle elle a été donnée.
- C'est le serveur d'ADA qui appelle l'adresse saisie : https uniquement, adresses locales ou
  internes refusées (y compris une IPv4 cachée en IPv6 et le réseau partagé des opérateurs), nom de
  domaine résolu vers des adresses publiques seulement, redirections jamais suivies.

## Conséquences
- **Positives** : chacun travaille avec le modèle qu'il a le droit d'utiliser ; ADA n'a pas à connaître
  les clés des utilisateurs en clair ni à les distribuer.
- **Négatives** : un modèle qui tourne sur un poste (Ollama) n'est pas joignable ; changer
  `SESSION_SECRET` rend les clés enregistrées illisibles ; la résolution d'un nom peut changer après
  la vérification (rebinding DNS), que seule une règle réseau sur le serveur empêche vraiment.
- Les données de la demande partent vers la passerelle choisie par l'utilisateur : c'est à lui de
  s'assurer qu'elle convient à son projet (un projet d'ADA ne contient que des données fictives).
