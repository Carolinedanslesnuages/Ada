# ADR-0020 — L'agent d'ADA reçoit les conventions de la Fabnum et les skills de sécurité et RGAA de la DINUM

- **Statut** : Accepted
- **Date** : 2026-11-27
- **Décideurs** : responsable d'ADA
- **Sujet** : quelles skills de la Fabnum et de la DINUM sont données à l'agent de l'interface

## Contexte
Les outils de la Fabnum passent en premier pour ADA et ses projets. Plusieurs dépôts publient des
skills : `dnum-mi/fabnum-cicd`, `dnum-mi/transversal-doc`, `dnum-mi/starter-kit-opencode`,
`IA-Generative/agent-skills`, `etalab-ia/skills`. ADA refuse toute skill qui pré-autorise des
outils (`allowed-tools`) ou lance une commande au chargement (`skillSure`, `outils.ts`).

## Décision
- **Sous-modules** (ADR-0018) : `skills/externes/transversal-doc` et `skills/externes/etalab-skills`.
- **Données à l'agent** (`AGENT_SKILLS` par défaut), chacune avec le moment où l'ouvrir :
  - `fabnum-code-style`, `fabnum-client`, `fabnum-server`, `fabnum-rest-api`,
    `fabnum-project-docs` (transversal-doc) ;
  - `securite-developpement` et `rgaa` (etalab-ia/skills).
- **Pas données à l'agent** :
  - `fabnum-stack`, `fabnum-project-structure`, `fabnum-cicd`, `fabnum-deployment`,
    `fabnum-poc-to-prod` : la stack, la CI, le chart et le déploiement sont fixés par le modèle
    du projet, et l'agent ne peut pas modifier `.github/` ni `charts/`. Elles servent à
    construire ADA et ses modèles ;
  - les skills de fabnum-cicd et de starter-kit-opencode : elles déclarent `allowed-tools` ;
  - `anssi-guides` : elle dépend d'un service en ligne, et l'agent n'a pas d'accès au web.
- **La consigne tranche les conflits** : la stack, les dépendances et les fichiers protégés du
  projet ne changent pas pour suivre une méthode (par exemple pnpm au lieu de npm) ; l'agent
  applique le reste de la méthode.
- Un test vérifie que chaque skill livrée par défaut existe et passe `skillSure`.

## Conséquences
- **Positives** : le code écrit pour les PO suit les conventions de la Fabrique numérique et
  les règles de sécurité de l'ANSSI.
- **Négatives** : la consigne s'allonge de sept lignes ; chaque lecture de skill coûte un tour.
  L'effet sur la qualité est à mesurer au banc d'essai (`scripts/banc-agent`).
- **À surveiller** : les skills de transversal-doc ne sont pas encore fusionnées
  (transversal-doc #32). Le sous-module est figé sur le dernier commit de cette PR : il faudra
  le déplacer sur `main` à la fusion, avant que la branche soit supprimée. Le dépôt ne précise
  pas sa licence : ADA le référence, sans le copier.
