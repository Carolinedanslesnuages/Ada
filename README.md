# Atelier PO

Des **Product Owners** produisent des POC en autonomie avec un assistant de code : ils créent
un projet, écrivent des user stories ou signalent des problèmes ; l'assistant pose ses
questions, fait valider un plan, code avec tests et contrôle d'accessibilité, et livre une
pull request que le PO fusionne quand la CI est verte. Un développeur n'intervient qu'en
dernier recours.

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
| CI (`ci.yml`) : anti-fuite, lint, types, tests (dont accessibilité), compilation | Le filet de sécurité qui remplace la relecture humaine |
| gitleaks (pre-commit + CI), `.gitignore` durci, `private/` | Aucun secret, aucune donnée réelle |
| release-please | Versions et journal des changements automatiques |
| `AGENTS.md` (+ `CLAUDE.md` qui l'importe) | Le projet fonctionne avec n'importe quel agent |
| ADR-0001 « Choix de la stack » | Trace du pourquoi, pour le développeur qui reprendra le POC |
| Modèles d'issues (story, bug) et de PR | Même format que l'interface PO |
| `GET /__version__` (contrat `repo-version-json`) | Savoir quelle version tourne |

## Utiliser

**Avec VS Code** : ouvrir `atelier-po.code-workspace`, puis dans le panneau de l'assistant :
`/po-projet-nouveau`, `/po-story …`, `/po-bug …`. Guide pour le PO : [GUIDE-PO.md](GUIDE-PO.md).

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
