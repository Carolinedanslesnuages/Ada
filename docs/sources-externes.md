# Sources externes reprises ou citées

| Élément de l'atelier | Source | Nature |
|---|---|---|
| Hook `destructive-guard` (`.claude/settings.json`) | [IA-Generative/agent-skills](https://github.com/IA-Generative/agent-skills), `hooks/destructive-guard.md` | Repris tel quel (extrait automatiquement du fichier source) |
| `.gitignore` durci, `private/`, pre-commit gitleaks (`po-projet-nouveau/references/securite.md`) | agent-skills, skill `repo-init` | Adapté |
| Contrôle de périmètre (`po-story/references/perimetre.md`) | agent-skills, skill `repo-perimetre` | Méthode résumée ; la skill d'origine est appelée si elle est installée |
| Méthode hypothèses + test rouge (`po-bug`) | agent-skills, skill `bug-investigate` | Méthode résumée ; la skill d'origine est appelée si elle est installée |
| Format ADR (`po-projet-nouveau/references/socle.md`) | agent-skills, skill `adr-new` | Modèle repris |
| Contrat `GET /__version__` | agent-skills, skill `repo-version-json` (ADR-0004 MirAI, format Dockerflow) | Contrat repris ; la production du `version.json` reste à `repo-version-json --setup` |
| Invariants des skills, `agents/openai.yaml`, catalogues `index.json` | agent-skills, `AGENTS.md` et `scripts/skills-index.mjs` | Conventions reprises, scripts réécrits |
| release-please | [googleapis/release-please-action](https://github.com/googleapis/release-please-action) v5.0.0 | Action épinglée |
| gitleaks | [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) v8.30.1 | Binaire épinglé, empreinte vérifiée |
| axe-core | [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | Bibliothèque de test d'accessibilité |
| DSFR / vue-dsfr | [@gouvfr/dsfr](https://www.systeme-de-design.gouv.fr/), [@gouvminint/vue-dsfr](https://github.com/dnum-mi/vue-dsfr) | Dépendances |

Si l'atelier est versé dans agent-skills, les éléments « résumés » doivent céder la place à un
appel direct des skills d'origine, déjà présentes dans ce dépôt.
