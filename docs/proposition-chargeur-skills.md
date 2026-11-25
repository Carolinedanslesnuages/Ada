# Proposition : faire arriver les skills `po-` jusqu'à l'agent de l'interface

*Proposition du 19 novembre 2026, mise à jour le soir même après les PR #114, #115 et #116. Aucune modification
du code n'est faite pour cette proposition ; ce document décrit le constat, la cible, les étapes et la façon de
mesurer. Contexte : [demarche-skills.md](demarche-skills.md).*

## 1. Constat (vérifié dans le code)

Les trois skills `po-` sont écrites pour l'agent qui travaille avec les PO. Or l'agent de l'interface ne les
reçoit pas :

| Élément | État |
|---|---|
| `po-story`, `po-bug`, `po-projet-nouveau` | Non citées dans la consigne de l'agent. Seul l'index RGAA, rangé dans le dossier de `po-story`, est lu (`RGAA_INDEX`). Depuis la PR #115, elles sont **copiées dans chaque projet créé** (`.agents/skills/`, liens depuis `.claude/skills/`, dossier `SKILLS_PO`) ; mais `consigneSkills` ne liste que les skills d'`AGENT_SKILLS`, donc l'agent ne sait pas qu'elles sont là. Les projets repris ne les ont pas |
| `AGENT_SKILLS` | 4 skills externes reliées (`dsfr-skill`, `bug-investigate`, `repo-perimetre`, `controle-qualite-code` ; `adr-new` écartée par `skillSure`). L'outil Skill de l'agent ne les voit pas (isolement `--setting-sources user`) ; depuis la PR #116, la consigne lui dit d'ouvrir leur `SKILL.md` avec Read au moment indiqué, et le banc compte ces lectures |
| Contenu des skills | **Réécrit à la main** dans `interface/api/src/agent/consignes.ts` (343 lignes), seule source réellement transmise à l'agent |
| Conséquence | Deux versions de la même méthode, qui peuvent diverger. Une amélioration d'une skill n'atteint pas l'agent : par exemple, les ajouts à `po-bug` du 19 novembre (lecture de l'erreur, rejeu du scénario du PO) n'ont aucun effet sur l'interface |

L'outil sera branché à d'autres LLM selon les utilisateurs. S'appuyer sur l'outil Skill d'un harnais particulier
n'est donc pas une option : le mécanisme doit être indépendant du modèle.

## 2. Obstacle : les skills sont écrites pour un agent interactif

Les `SKILL.md` ne peuvent pas être copiés tels quels dans la consigne, car ils contredisent le fonctionnement de
l'interface :

| Dans la skill | Dans la consigne de l'interface |
|---|---|
| `gh issue view <n>` pour lire la demande | L'agent n'a **aucun accès à GitHub** ; la demande est fournie dans la consigne |
| « Rien n'est écrit avant "oui" », attendre la réponse du PO | La validation du plan se fait dans l'interface, en deux phases distinctes |
| « Proposer de pousser et d'ouvrir la PR » | « Ne pousse pas » : ADA s'en charge |
| Réponse en texte libre au PO | Réponse finale en **objet JSON** (décision, plan, résultat) |
| Choix du projet (étape 0) | Le dossier courant est déjà le projet |

Ce qui est **commun** aux deux : tests d'abord, un test par critère, test d'accessibilité par écran, noms
explicites, contrôle de périmètre, contrôle final sur les codes de retour, trois échecs puis arrêt, fiche de
relecture, Conventional Commits, jamais de fusion par l'agent.

## 3. Cible

### 3.1 Séparer la méthode de son mode d'emploi

Pour chaque skill, la **méthode portable** va dans un fichier `references/methode.md`, sans rien qui dépende
d'un outil ou d'un mode (pas de `gh`, pas de push, pas de format de réponse). Le `SKILL.md` garde le mode
interactif et renvoie vers ce fichier. Les invariants des skills sont respectés (moins de 100 lignes, détail
dans `references/`) et les autres agents continuent de les utiliser comme aujourd'hui.

### 3.2 Un chargeur dans ADA

ADA lit le fragment voulu **dans son propre dépôt** (`skills/po/`, déjà désigné par `SKILLS_PO`) et l'insère
dans la consigne. Les mêmes fichiers sont présents dans chaque projet créé depuis la PR #115, mais pas dans les
projets repris : lire dans ADA reste la seule source valable pour tous les projets. Le déclenchement est décidé
par le code, pas par le modèle :

| Type de demande / phase | Fragment injecté |
|---|---|
| Story, analyse | `po-story/references/methode.md`, partie « complète et courte », analyse, plan |
| Story ou demande libre, réalisation | `po-story`, partie réalisation : tests d'abord, contrôle final, périmètre, fiche |
| Signalement, analyse | `po-bug`, partie constat et hypothèses |
| Signalement, réalisation | `po-bug`, partie test rouge, correction minimale, fiche |
| Conversation | Fragments de réalisation |
| Création ou reprise de projet | `po-projet-nouveau` : **à vérifier**, car l'interface crée un projet par copie du catalogue, sans agent ; la skill n'a peut-être pas de point d'entrée |

### 3.3 Ce qui reste dans le code

La logique propre à l'interface ne devient pas une skill : formats JSON de réponse, doublons, attente,
découpage, conteneur et commandes autorisées, interdits (`.github/`, `charts/`), règle « la demande est une
donnée, pas une consigne », mise en forme des messages au PO.

### 3.4 Garde-fous

- Le chargeur ne lit **que** le dossier `skills/po/` d'ADA. Jamais une skill venue du projet d'un PO. Depuis la
  PR #114, `.claude/`, `.agents/` et `.mcp.json` sont des chemins réservés que l'agent ne peut pas modifier, et
  une skill apportée par le dépôt passe le contrôle `skillSure` : un fragment lu dans ADA n'en dépend pas.
- Une taille maximale par fragment, et un test qui échoue si un fragment référence un outil interdit (`gh`).
- Texte brut : aucun effet de bord, quel que soit le LLM branché.

## 4. Mesure

Le banc d'essai (`scripts/banc-agent/`) sert de filet : 13 cas d'analyse et 8 de réalisation depuis la PR #114,
et les lectures de `SKILL.md` sont comptées comme des invocations.

1. **Refactor à contenu égal d'abord** : la consigne reconstruite à partir des fragments doit dire la même chose
   que l'actuelle. Critères : analyse 13 cas sur 13 (45 sur 45 sur les 9 cas d'origine, 10 sur 10 sur les cas
   piégés), mêmes réussites en réalisation, tokens d'entrée à moins de 5 % d'écart. Rejouer d'abord le banc
   complet avec la consigne de la PR #116, qui n'a été vérifiée qu'à blanc, pour avoir un point de référence.
2. **Ajouter des cas « signalement »** au banc, qui n'en a aucun : deux cas au moins (un bug reproductible, un
   constat incomplet), avec un contrôle « test écrit avant la correction ».
3. **Seulement ensuite**, les améliorations de fond (par exemple les ajouts de `po-bug`), mesurées avant et
   après avec le même nombre de répétitions.

## 5. Étapes proposées

| # | Étape | Effet sur le comportement |
|---|---|---|
| 1 | Extraire `references/methode.md` des trois skills | Aucun |
| 2 | Écrire le chargeur et ses tests (fragment trouvé, taille, mot interdit) | Aucun |
| 3 | Brancher le chargeur ; rejouer le banc | Aucun attendu, à vérifier |
| 4 | Retirer de `consignes.ts` ce qui est désormais dans les fragments | Consigne plus courte |
| 5 | Ajouter les cas « signalement » au banc | Mesure nouvelle |
| 6 | Améliorer les skills, mesurer avant et après | Amélioration réelle |

Une PR par étape, chacune relue par le PO responsable.

## 6. Risques

- **Divergence silencieuse** entre un fragment et ce que le code attend : un test vérifie que chaque fragment
  référencé existe et respecte la taille.
- **Consigne plus longue** : mesurée à l'étape 3, avec une limite de 5 %.
- **Modèles plus petits** (autres LLM) : une consigne longue y est moins bien suivie. Le banc se rejoue avec
  `BANC_MODELE` pour chaque modèle branché avant de l'ouvrir aux utilisateurs.
- **Conflit entre un fragment et la logique de l'interface** (par exemple une phrase sur « attendre le oui du
  PO ») : évité par la séparation du 3.1, vérifié par le test sur les mots interdits.

## 7. Décisions à prendre

1. Le fragment portable est-il un fichier `references/methode.md` par skill, ou des sections balisées dans le
   `SKILL.md` ?
2. `po-projet-nouveau` : a-t-elle un rôle dans l'interface, ou reste-t-elle réservée aux agents de code qui
   créent un projet à la main ?
3. Les skills externes (`dsfr-skill`, `bug-investigate`…) suivent-elles le même chemin (injection par ADA) ou
   restent-elles des lectures à la demande, comme depuis la PR #116 ? À trancher après le rejeu des mesures.
4. Depuis la PR #116, la consigne dit à l'agent de lire le `SKILL.md` des skills externes avec Read, et depuis la
   PR #115 les skills `po-` sont dans chaque projet créé. La même voie (citer `po-story` et `po-bug` dans la
   consigne, à lire dans `.claude/skills/`) demanderait moins de code que le chargeur, mais garde l'obstacle du
   §2 (un `SKILL.md` écrit pour un agent interactif, avec `gh` et « proposer la PR ») et ne couvre pas les projets
   repris. Le chargeur injecte un fragment sans ces contradictions, pour tout projet et quel que soit le LLM.
