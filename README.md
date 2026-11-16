# ADA — Atelier de Développement Assisté

**Une interface de développement no-code.** ADA permet à des personnes qui ne codent pas de
réaliser leurs POC avec un assistant de code. Elles créent un projet, décrivent leurs besoins
sous forme de user stories ou signalent des problèmes. L'assistant pose ses questions, fait
valider un plan, code avec tests et contrôle d'accessibilité, puis livre une pull request.
Elle est fusionnée quand la CI est verte.

## Aperçu

*Captures réalisées avec des données de démonstration.*

**Accueil** : ce qu'est ADA, et la connexion avec GitHub.

![Page d'accueil d'ADA](docs/captures/accueil.png)

**L'atelier** : les stories à gauche, l'aperçu du produit à droite. Ici, l'assistant a posé
une question, obtenu la réponse, et attend qu'on valide son plan.

![Atelier : plan à valider](docs/captures/atelier-plan.png)

**La vérification** : la story est réalisée, tous les contrôles sont réussis ; il reste à
regarder le résultat dans l'aperçu et à valider.

![Atelier : story à vérifier, contrôles réussis](docs/captures/atelier-verification.png)

**Nouveau projet** : un nom, un objectif, et le type de produit à créer.

![Formulaire de création d'un projet](docs/captures/nouveau-projet.png)

Skills au format ouvert [Agent Skills](https://agentskills.io) : Claude Code, Codex, OpenCode,
Cursor, Copilot, Gemini CLI. Conventions alignées sur
[IA-Generative/agent-skills](https://github.com/IA-Generative/agent-skills), pour pouvoir y
être versées comme groupe `po`.

> 🤖 Vous êtes un agent de codage ? Lisez [`AGENTS.md`](AGENTS.md).

## Skills

| Skill | Ce qu'elle fait |
|---|---|
| `po-projet-nouveau` | Nom → objectif → stack (6 autorisées) → DSFR → squelette testé, CI, anti-fuite gitleaks, release-please, ADR-0001, modèles d'issues et de PR, route `/__version__` |
| `po-story` | Story complète et courte (4 critères au maximum) → plan validé → tests d'abord → RGAA (axe-core + grille) → contrôle de périmètre → fiche de relecture → PR |
| `po-bug` | Constat → 2-3 hypothèses → test rouge → correction minimale → fiche → PR |

Toutes trois ont un effet de bord : elles ne se lancent que **sur demande explicite**.

## Ce que chaque projet reçoit dès sa création

| Élément | Rôle |
|---|---|
| CI (`ci.yml`) : anti-fuite, lint, types, tests (dont accessibilité), compilation | Vérifie automatiquement chaque changement |
| gitleaks (pre-commit + CI), `.gitignore` durci, `private/` | Aucun secret, aucune donnée réelle |
| release-please | Versions et journal des changements automatiques |
| `AGENTS.md` (+ `CLAUDE.md` qui l'importe) | Le projet fonctionne avec n'importe quel agent |
| ADR-0001 « Choix de la stack » | Garde la trace des choix techniques |
| Modèles d'issues (story, bug) et de PR | Même format que l'interface web |
| `GET /__version__` (contrat `repo-version-json`) | Savoir quelle version tourne |

## Utiliser

**Avec VS Code** : ouvrir `ada.code-workspace`, puis dans le panneau de l'assistant :
`/po-projet-nouveau`, `/po-story …`, `/po-bug …`. Guide d'utilisation : [GUIDE-PO.md](GUIDE-PO.md).

**Avec l'interface web** (`interface/`, dépôt séparé) : connexion GitHub, stories et
signalements à gauche, aperçu du produit à droite.

**Ailleurs** : les skills sont dans `skills/po/` ; des liens les exposent dans `.claude/skills/`
et `.agents/skills/`. Pour les installer pour tous ses projets : lier chaque dossier de
`skills/po/` dans `~/.claude/skills/` ou `~/.agents/skills/` (un lien par skill, jamais le
dossier parent).

## Garde-fous de l'atelier (Claude Code)

`.claude/settings.json` : hook `destructive-guard` (repris d'agent-skills) qui bloque
`git reset --hard`, `push --force`, `--no-verify`, `DROP TABLE`, `docker volume prune`… ;
permissions limitées ; lecture des `.env` interdite. Les autres agents ont leurs propres
mécanismes : la CI et la protection de `main` restent le vrai filet.

## Contribuer

[CONTRIBUTING.md](CONTRIBUTING.md). Vérifications :
```bash
node scripts/verifier-skills.mjs
node scripts/skills-index.mjs --check
```

## Sources

[docs/sources-externes.md](docs/sources-externes.md).
