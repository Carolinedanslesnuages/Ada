# Agent OpenAI pour ADA (sans Claude Code)

Un agent de code qui parle à une passerelle **compatible OpenAI** (GLM-5 du bureau, Ollama, etc.). Il
reprend les options de Claude Code qu'ADA utilise et écrit la même sortie `stream-json` : **ADA n'a rien
à changer**, on bascule d'un agent à l'autre dans `interface/api/.env`.

## Configuration (une fois, sur chaque poste)

Créer `~/.config/glm-ada/env` (jamais dans le dépôt, droits `600`) :

```
OPENAI_BASE_URL=   # adresse de la passerelle, se terminant en général par /v1
OPENAI_API_KEY=
OPENAI_MODEL=chat  # nom du modèle côté passerelle
```

Créer le lanceur `~/.local/bin/glm-ada` (`chmod +x`), avec le chemin de ce dépôt :

```sh
#!/bin/sh
exec node "/CHEMIN/DU/DEPOT/interface/api/agent-openai/runner.mjs" "$@"
```

## Basculer dans ADA (`interface/api/.env`)

| Agent | AGENT_COMMANDE | AGENT_MODELE |
|---|---|---|
| Claude Code | `/Users/vous/.local/bin/claude-ada` | `sonnet` |
| Passerelle OpenAI | `./agent-openai/runner.mjs` | **n'importe quel nom de modèle**, transmis tel quel (`glm-5`), ou vide pour `OPENAI_MODEL` |

### Plusieurs passerelles, plusieurs modèles

`AGENT_MODELE=profil/modèle` choisit la passerelle **et** le modèle. Le profil est un fichier
`~/.config/glm-ada/<profil>.env` (mêmes lignes que `env`) :

| AGENT_MODELE | Passerelle lue | Modèle envoyé |
|---|---|---|
| `glm-5` | `~/.config/glm-ada/env` | `glm-5` |
| `bureau/glm-5` | `~/.config/glm-ada/bureau.env` | `glm-5` |
| `ollama/qwen3.6:35b` | `~/.config/glm-ada/ollama.env` | `qwen3.6:35b` |

Si le préfixe n'est pas un profil existant, tout le texte est le nom du modèle (`meta/llama-3.3-70b`).
Facultatifs dans un fichier de profil : `OPENAI_TEMPERATURE` et `OPENAI_MAX_TOKENS` (rien n'est envoyé par
défaut, car certains modèles refusent ces paramètres). La clé peut rester vide (Ollama).

Redémarrer l'API d'ADA après le changement, **quand aucun agent ne travaille**.

## En ligne (serveur, conteneur)

Rien ne doit dépendre d'un poste de travail :

- **Commande** : `runner.mjs` est exécutable (`#!/usr/bin/env node`) et ADA lit un chemin relatif depuis
  `interface/api` : `AGENT_COMMANDE=./agent-openai/runner.mjs`, identique sur tous les postes et en ligne, sans
  lanceur dans `~/.local/bin` ni chemin personnel. Node doit être installé dans l'image.
- **Passerelle** : `OPENAI_BASE_URL`, `OPENAI_API_KEY` et `OPENAI_MODEL` en **variables d'environnement du
  serveur** (secrets du déploiement). ADA les laisse passer jusqu'à l'agent ; l'agent les retire de
  l'environnement des commandes qu'il lance. Les fichiers `~/.config/glm-ada/` ne servent qu'en local.
- **Skills** : `AGENT_SKILLS` doit viser des dossiers présents dans l'image (copiés ou clonés à la
  construction), pas des clones dans le dossier personnel de quelqu'un.
- **Conversations** : l'historique est écrit dans `~/.local/state/glm-ada/sessions/` ; sur un serveur, ce dossier
  doit être un volume qui survit aux redémarrages (sinon une conversation reprise repart de zéro).

## Ce que l'agent fait et ne fait pas

- Outils : `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Skill`, limités par `--allowedTools` et
  `--disallowedTools` comme avec Claude Code (un interdit l'emporte). Hors du projet : refusé.
- Une commande `Bash` qui enchaîne (`;`, `&&`, `|`), redirige ou substitue (`$(…)`, `` ` ``) est refusée.
- Il lit `CLAUDE.md` et `AGENTS.md` du projet et propose les skills de `.claude/skills` et `.agents/skills`.
- Les conversations se reprennent (`--resume`) : l'historique est dans `~/.local/state/glm-ada/sessions/`.
- Le modèle doit gérer les **appels d'outils** (function calling). Sinon il explique au lieu d'agir.
  Essayé avec Ollama + qwen3.6:35b : fichier créé, test lancé, commandes interdites refusées.
  GLM-4 (9 milliards de paramètres, Ollama) n'appelait aucun outil.

## Essayer sans ADA

```sh
cd un-dossier-de-test && git init
OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_API_KEY=ollama OPENAI_MODEL=qwen3.6:35b \
  node /CHEMIN/runner.mjs -p "Crée somme.js …" --output-format stream-json --verbose --max-turns 8 \
  --no-session-persistence --allowedTools Read 'Write(./**)' 'Bash(npm test)'
```

Tests des permissions : `node --test interface/api/agent-openai/runner.test.mjs`
