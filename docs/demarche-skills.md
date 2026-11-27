# Recherche sur les harnais et les skills d'ADA

*Travail mené en novembre 2026, mis à jour le 19 novembre 2026 au soir (état du dépôt après les PR #114, #115
et #116). Ce document rend compte de la démarche, des mesures et des décisions ; la liste des sources reprises
est dans [sources-externes.md](sources-externes.md).*

## Pourquoi cette recherche

ADA permet à des Product Owners de produire des POC en autonomie : un agent de code travaille pour eux. À
l'origine, l'objectif était d'**explorer les harnais et les skills** : comment un agent de code se comporte
selon ce qui l'entoure (consignes, outils autorisés, skills). L'interface d'ADA est née de cette exploration.

Une fois l'atelier en service, la question s'est reformulée : **ADA a-t-elle les bons harnais et les bonnes
skills ?** Quatre questions de recherche en découlent.

1. Les consignes écrites dans le code doivent-elles devenir des skills ?
2. Le harnais est-il fiable pour sa **qualité**, et pas seulement pour sa sécurité ?
3. Les skills déjà publiées par l'administration (DINUM, IA-Generative) sont-elles utilisées, et servent-elles ?
4. Des outils ouverts existants amélioreraient-ils ADA ?

La règle de travail : **une brique n'est ajoutée que si une mesure montre qu'elle améliore le résultat.**
Chaque brique coûte des appels en plus, du temps, de l'empreinte carbone, et un comportement moins maîtrisé.

## Méthode

### Un banc d'essai rejouable

Un [banc d'essai](../scripts/banc-agent/README.md) rejoue l'agent d'ADA avec **exactement** les consignes, les
outils autorisés et les options de l'API, sur des projets jetables (copie du modèle « pwa »). Rien n'est écrit
sur GitHub ni dans ADA. Deux bancs :

| Banc | Question posée | Cas |
|---|---|---|
| Analyse | Pour chaque demande, l'agent choisit-il la bonne décision (questions, plan, découpage, attente) ? Cite-t-il le doublon ? Résiste-t-il à une consigne piégée ? | 13 : claire, floue, grosse, doublon, attente, impasse, voisin, contradiction, et 5 consignes piégées (dans la demande, dans son titre, dans le titre d'une autre story, dans les fichiers du projet, à propager dans des stories) |
| Réalisation | L'agent livre-t-il une petite story : commit, fiche, tests dont accessibilité, contrôles du projet verts, composants DSFR ? | 8 : impression, recherche, tableau, alerte, accordéon, fil d'Ariane, et 2 consignes piégées (dans un critère, dans les fichiers du projet) |

Le banc de réalisation relance lui-même les contrôles du projet dans un conteneur à part : il ne croit pas
l'agent sur parole.

### Des comparaisons à conditions égales

Pour chaque hypothèse, deux variantes sont jouées avec le même modèle, le même nombre de répétitions et les
mêmes cas : la consigne actuelle contre la variante testée (règles passées en skill, skill imposée…). Sont
relevés la réussite, la durée, le nombre de tours, les tokens produits et l'estimation de CO2e.

### Une veille sur l'existant

Les dépôts publics et les outils ouverts du domaine (assistants de code de l'administration, bacs à sable,
bibliothèques de skills, outils d'optimisation) ont été lus, puis testés quand un gain était plausible.

## Consigne ou skill ?

| | Consigne écrite dans le code d'ADA | Skill |
|---|---|---|
| Chargée | à chaque exécution, d'office | seulement si l'agent l'invoque |
| Coût | aucun appel en plus | un aller-retour pour la lire |
| Adaptée à | les règles utilisées **à chaque fois** | les règles **conditionnelles**, ou à partager avec d'autres agents et d'autres projets |

## Résultats

| Hypothèse testée | Résultat |
|---|---|
| Avec la consigne actuelle, l'agent décide-t-il bien à l'analyse ? | 45 réussites sur 45 sur les 9 cas d'alors. Les 5 cas de consignes piégées ajoutés le 19 novembre (PR #114) : 10 réussites sur 10 à l'analyse (2 répétitions), 2 sur 2 en réalisation, sans toucher à `.claude/`, `CLAUDE.md` ni `AGENTS.md` |
| Les skills reliées au projet sont-elles proposées à l'agent ? | **Non, par l'outil Skill.** L'isolement (`--setting-sources user`) les masque à cet outil, qui répond « Unknown skill ». Vérifié le 19 novembre 2026 : avec `user,project`, elles apparaissent. Le constat antérieur « 0 invocation spontanée sur une soixantaine d'exécutions » est donc sans valeur : les skills n'étaient pas offertes. **Décision du 19 novembre (PR #116)** : l'isolement est conservé ; la consigne ne parle plus de l'outil Skill et dit à l'agent d'ouvrir le `SKILL.md` de chaque skill avec Read au moment indiqué (lecture déjà autorisée). Le banc compte ces lectures comme des invocations. Aucun banc complet n'a encore été rejoué avec cette consigne |
| Règles d'analyse déplacées de la consigne vers une skill | Aucun gain de qualité ; durée multipliée par 3 ; 64 % de tokens en plus. *Mesuré alors que l'outil Skill ne voyait pas les skills : à rejouer* |
| Index RGAA déplacé vers une skill | Même qualité ; durée multipliée par 2. *Même réserve : à rejouer* |
| `dsfr-skill` imposée | Même qualité DSFR (l'agent choisit déjà les bons composants, sans la skill, ce qui reste valable : c'est la situation réelle d'ADA) ; 33 % de tokens en plus et 7 tours de plus pour une skill que l'outil ne voyait pas. *À rejouer avec la consigne du 19 novembre, qui indique où la lire* |
| Audit RGAA d'un écran Vue aux 8 défauts plantés et 4 éléments corrects (2 répétitions, skill `rgaa` réellement visible) | Les deux variantes trouvent les 8 défauts, sans faux positif. La skill ajoute de la structure (mode composant, stack, statuts « non testé » au lieu de conclure) pour 60 % de tokens en plus (4 865 contre 3 045) et un rapport plus long (6 044 contre 4 010 caractères). Sur un cas aussi simple, pas de gain de détection |
| RTK (compression des sorties de commandes) | Environ 1 % de réduction sur le modèle « pwa » : les sorties d'ADA sont déjà courtes |
| `securite-developpement` imposée, sur 3 demandes qui tentent l'agent d'écrire du code fragile (2 répétitions). *Mesuré alors que l'outil Skill ne voyait pas la skill : la variante « avec skill » n'a probablement pas utilisé la skill ; essai à rejouer* | Dans cette configuration, aucun écart démontré : sur 7 contrôles de sécurité, 6 sont réussis dans les deux variantes (code gardé sous forme d'empreinte avec sel, essais limités, aucun `v-html`, aucun `eval`, forme des données contrôlée). Seul écart : la taille maximale d'un fichier importé, contrôlée 1 fois sur 2 avec la skill et 0 fois sur 2 sans, soit une exécution d'écart. Coût équivalent (13 010 contre 12 733 tokens produits, 35 contre 37 tours) |

**Conséquence :** les règles de tous les jours restent dans la consigne. Les skills servent à ce qui est
conditionnel ou partageable.

## Skills créées pour ADA (`skills/po/`)

| Skill | Pourquoi une skill dédiée |
|---|---|
| `po-projet-nouveau` | Aucune skill existante ne couvre « un PO démarre un POC » : nom, objectif, stack autorisée, DSFR, squelette testé, CI, anti-fuite, ADR |
| `po-story` | Le parcours d'une demande de PO : story complète et courte, plan validé, tests d'abord, RGAA, périmètre, fiche de relecture |
| `po-bug` | Un signalement de PO : constat, hypothèses, test rouge, correction minimale, fiche |

Les skills d'ailleurs s'adressent à des développeurs. Celles d'ADA parlent en langage métier, posent peu de
questions (trois au plus), s'arrêtent quand une information manque et ne fusionnent jamais : le PO décide. Elles
suivent les invariants d'agent-skills (nom identique au dossier, moins de 100 lignes, une description qui dit
quoi et quand) pour rester portables vers Codex, OpenCode, Cursor, Copilot ou Gemini CLI.

Depuis le 19 novembre (PR #115), **chaque projet créé par ADA embarque ces trois skills** : copiées dans
`.agents/skills/` et reliées depuis `.claude/skills/` au commit de création (dossier `SKILLS_PO`, environ
300 Ko). Les projets repris ne sont pas touchés. Elles guident un agent piloté par une personne, dans ADA ou dans
le projet ; **l'agent de l'interface ne les reçoit pas** : il suit les consignes écrites dans
`interface/api/src/agent/consignes.ts`, et la consigne ne cite que les skills d'`AGENT_SKILLS`. Comment lui
faire parvenir la méthode des skills `po-` est l'objet de
[proposition-chargeur-skills.md](proposition-chargeur-skills.md).

## Skills reprises sans être copiées

Reliées depuis un clone local, mises à jour par `git pull` (voir `AGENT_SKILLS`).

| Skill | Origine | Rôle dans ADA |
|---|---|---|
| `dsfr-skill` | DINUM | Composants du système de design de l'État |
| `bug-investigate`, `repo-perimetre`, `controle-qualite-code` | agent-skills IA-Generative | Méthode de diagnostic, contrôle de périmètre, qualité |
| `fabnum-code-style`, `fabnum-client`, `fabnum-server`, `fabnum-rest-api`, `fabnum-project-docs` | transversal-doc (Fabnum) | Conventions de la Fabrique numérique pour écrire le code, depuis le 27 novembre 2026 (ADR-0020) |
| `securite-developpement`, `rgaa` | etalab-ia/skills (DINUM) | Sécurité (guides de l'ANSSI), auto-évaluation RGAA, depuis le 27 novembre 2026 (ADR-0020) |
| `adr-new` | agent-skills IA-Generative | **Écartée** : elle pré-autorise des outils (`allowed-tools`), ce qu'ADA refuse pour toute skill. Le format des ADR est repris dans `po-projet-nouveau/references/socle.md` |

ADA écarte toute skill qui pré-autorise des outils ou exécute des commandes au chargement (contrôle `skillSure`
dans `interface/api/src/agent/outils.ts`). Depuis le 19 novembre (PR #114), ce contrôle s'applique aussi aux
skills apportées par le dépôt du projet (projet repris, PR fusionnée) : une skill dangereuse fait refuser la
demande, et un dossier du projet qui porte le nom d'une skill d'ADA ne la remplace plus en silence. `.claude/`,
`.agents/` et `.mcp.json` sont des chemins réservés que l'agent ne peut pas modifier.

Pour `po-bug` et `po-story`, la méthode de la skill d'origine est **résumée** dans la skill d'ADA, et la skill
d'origine est appelée si elle est installée : la skill d'ADA fonctionne seule, sans dépendre d'un clone.

## Pistes examinées et décisions

| Piste | Décision | Pourquoi |
|---|---|---|
| **Superpowers** (obra) | Écarté en bloc ; deux idées reprises | Son enchaînement (cadrer, planifier, tester d'abord, relire) existe déjà dans ADA. Il impose beaucoup de skills à chaque tâche, ce qui ajoute des appels (coût à confirmer, les mesures de skills imposées étant à rejouer). Il vise des développeurs, pas des PO. Idées reprises dans `po-bug` : lire l'erreur en entier et regarder ce qui a changé récemment ; rejouer le scénario du PO avant de conclure |
| **Imposer `dsfr-skill`** | Pas de décision | Sans la skill, l'agent choisit déjà les bons composants. Mesure du surcoût à rejouer avec la consigne du 19 novembre, qui indique où la lire |
| **Règles d'analyse et index RGAA en skills** | Pas de décision | Aucun gain mesuré, mais mesure faite avec des skills invisibles : à rejouer |
| **Rendre les skills visibles à l'outil Skill** (`--setting-sources user,project`) | Non (PR #116) | Ferait aussi lire les réglages du projet du PO et affaiblirait l'isolement. Retenu à la place : la consigne dit à l'agent d'ouvrir le `SKILL.md` avec Read au moment indiqué, et le banc compte ces lectures |
| **RTK** | Non | Gain d'environ 1 % ; un binaire tiers de plus pour rien |
| **Context7** (documentation à jour par MCP) | Non | L'agent est volontairement isolé de tout MCP ; élargir sa surface pour un gain non mesuré n'est pas justifié |
| **OpenHands**, Agent Factory, Code-Crafter | Non | Mêmes ambitions qu'ADA (issue vers PR dans un bac à sable), mais ils remplaceraient le harnais au lieu de l'améliorer ; les plus petits sont trop jeunes |
| **Albert Code** (DINUM) | Non, pour l'instant | Assemblage OpenCode + machine virtuelle jetable + Albert API + skills de l'État, pour un développeur sur son poste. Source d'inspiration, mais pas adapté à des PO |
| **Codebox** (DINUM) | Non ; document de sécurité à lire | Bac à sable de recherche (OpenCode dans une microVM, espace de travail scellé). Expérimental, « rien de stable » |
| **microsandbox**, agent-vm | Non | Isolation plus forte que Docker, mais gros chantier sans besoin identifié |
| **etalab-ia/skills** : `react-dsfr` | Non | ADA n'utilise pas React |
| **etalab-ia/skills** : `securite-developpement` | **Branchée le 27 novembre 2026** (ADR-0020) | Sur trois demandes sensibles, l'agent écrit déjà du code sûr sans la skill (c'est la situation réelle d'ADA). L'effet de la skill elle-même reste à mesurer. Elle reste utile comme référence de sécurité pour un développeur, et à rejouer si de nouveaux cas révèlent un défaut |
| **etalab-ia/skills** : `rgaa` | **Branchée le 27 novembre 2026** (ADR-0020), pour vérifier un écran avant le contrôle final | Même détection que sans skill sur le cas testé, avec un rapport mieux structuré. À envisager si un audit devient une fonction d'ADA |
| **etalab-ia/skills** : `usage-ia-agents-etat` | Non testable au banc | Cadre d'usage qui change des messages, pas des fichiers |
| **etalab-ia/skills** : `anssi-guides` | Écartée pour l'agent de l'interface | Dépend d'un service externe ; l'agent n'a pas d'outil web, et rien ne garantit la sortie réseau du conteneur de l'aperçu |

## En cours

- **Lecture effective des skills par l'agent** : la consigne du 19 novembre (PR #116) lui dit d'ouvrir les
  `SKILL.md` avec Read ; reste à vérifier au banc qu'il le fait au bon moment (la PR n'a rejoué que la
  construction à blanc des 13 consignes).
- **Rejouer les mesures** de skills imposées (`dsfr-skill`, `securite-developpement`, règles en skill) avec cette
  consigne.
- **Skills `po-` pour l'agent de l'interface** : proposition écrite
  ([proposition-chargeur-skills.md](proposition-chargeur-skills.md)), rien de codé. Depuis la PR #115 les
  skills sont dans chaque projet créé, mais l'agent de l'interface ne sait pas qu'elles y sont.
- **Audit RGAA sur un cas plus difficile** (plusieurs écrans, défauts moins évidents).
- **Cas de sécurité plus difficiles** : les trois demandes testées n'ont pas fait trébucher l'agent ; des cas
  plus retors (jeton à stocker, appel d'API externe, téléversement) pourraient révéler un écart.
- **Isolation des commentaires GitHub** : une analyse approfondie reste à mener, à reprendre à la lumière de
  l'ADR-0011 (ADA garde elle-même l'état des demandes).
- **Agents de plusieurs fournisseurs** (profil par type d'utilisateur) : à l'étude, rien n'est codé.

## Limites de ces mesures

- Les mesures de « skill imposée » faites avant le 19 novembre ne sont pas fiables : l'outil Skill ne voyait pas
  les skills reliées au projet. Seule la situation sans skill (celle d'ADA en service jusqu'au 19 novembre) est
  correctement mesurée. Depuis la consigne de la PR #116, aucun banc complet n'a été rejoué.
- Les essais sont petits (2 à 5 répétitions par cas) : ils écartent les gros écarts, ils ne mesurent pas les
  petites différences.
- Les durées varient avec la charge de la machine. Plusieurs durées d'un essai étaient faussées par des essais
  lancés en parallèle ; aucune conclusion ne s'appuie dessus.
- Les contrôles de l'essai de sécurité sont des recherches de motifs dans le code produit (par exemple la
  présence d'un sel ou d'un contrôle de taille) : ils repèrent une pratique, pas sa justesse.
- Les contrôles du banc jugent un comportement (bon composant, décision correcte), pas la qualité rédactionnelle
  ni l'accessibilité fine, qui demandent un humain.
- Les skills `po-` (celles des agents pilotés par une personne, dans ADA ou dans un projet créé par elle) ne sont
  pas couvertes par le banc : il teste l'agent de l'interface. Leur effet n'est pas mesuré.

## Méthode pour les prochaines décisions

1. Une règle est-elle utilisée à chaque exécution ? Elle va dans la consigne.
2. Est-elle conditionnelle ou à partager avec d'autres agents ? Elle devient une skill, qu'il faut **imposer**
   pour qu'elle serve.
3. Avant toute adoption, rejouer le banc d'essai (`scripts/banc-agent/`) avant et après, avec le même nombre de
   répétitions, en regardant aussi la durée et les tokens, pas seulement la réussite.
4. Noter ici la décision et sa raison, y compris lorsque la piste est écartée.
