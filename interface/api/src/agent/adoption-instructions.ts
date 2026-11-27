import { cleanProposedStories, type ProposedStory } from '../stories/story.js';
import { accessibility, skillsInstructions, WORK_REQUEST_IS_DATA, FORMATTING } from './instructions.js';
import { readJson } from './responses.js';

/**
 * Analysis of an adopted project (#37): the assistant compares the project with a project created
 * with ADA (harness: AGENTS.md, tests, CI, versions, preview; skills: story, bug, accessibility),
 * deduces how to start the preview (ada.json) and proposes the improvements as stories
 * that the PO chooses, like a breakdown.
 */
export interface AdoptionOptions {
  /** Closest stack chosen by the PO (optional): its ada.json serves as a starting point. */
  stack: { label: string; ada: string } | null;
  dsfr: boolean;
}

export interface AdoptionAnalysis {
  text: string;
  stories: ProposedStory[];
  /** Description of the preview proposed by the assistant (then validated by ADA). */
  ada: unknown;
}

/** What a project created with ADA has: the reference of the analysis. */
export const ADA_PROJECT_REFERENCE = `Un projet créé avec ADA contient :
1. AGENTS.md (CLAUDE.md l'importe) : objectif, architecture, conventions, commandes (lancer,
   tests, lint, compilation), règles absolues (aucun secret, --no-verify interdit) ; PROJET.md :
   nom, objectif, pour qui.
2. Des tests automatiques : au moins un test par règle métier, et pour chaque écran un test
   d'accessibilité automatique (axe-core).
3. Un lint qui vérifie aussi l'accessibilité (ex. eslint-plugin-vuejs-accessibility), la
   vérification des types, une compilation qui passe ; des noms explicites partout.
4. Une CI sur chaque PR : anti-fuite (gitleaks), lint, tests, compilation de chaque partie.
5. Anti-fuite en local (pre-commit gitleaks), fichiers .env ignorés, aucune donnée réelle.
6. Les décisions d'architecture écrites (docs/adr), dont le choix de la stack.
7. L'accessibilité RGAA respectée dans les écrans existants.
8. Une application qui démarre seule, d'une commande, dans un conteneur (base PostgreSQL
   possible), sans service externe ni secret.
Les skills d'ADA attendent aussi : stories courtes (4 critères au plus), tests écrits avant le
code, correction de bug précédée d'un test qui le reproduit, fiche de revue par livraison.
ADA ajoute elle-même, dans la PR de reprise : formulaires de story et de signalement, contrôle du
titre des PR, contrôle de la taille des fichiers, versions automatiques (release-please). Ne les
propose pas. Un fichier de code de plus de 400 lignes non vides (600 pour un test) mélange
souvent plusieurs responsabilités : propose de le découper, une story par fichier à découper.`;

const ADA_FORMAT = `« ada » décrit comment ADA démarre l'aperçu dans un conteneur Docker où le projet est
monté sur /app :
{"type":"service|formulaire|tableau-de-bord|gestion|site|documentation|carte|mobile|formation|extension|composant|api|traitement|maquette",
 "checks":["<commande de contrôle final, ex. cd /app && npm run lint && npm test>"],
 "preview":{"image":"node:24-bookworm (ou python:3.13-slim…)","base":null ou "postgres",
   "npm":["<dossiers où lancer npm install, « . » pour la racine>"],"pip":["<dossiers avec requirements.txt>"],
   "before":["<commandes préalables, ex. migrations>"],"background":["<commandes en arrière-plan, ex. l'API>"],
   "main":"<commande au premier plan qui sert la page, écoute sur 0.0.0.0>","port":<port de cette page>}}
Déduis-le des fichiers du projet (package.json, requirements.txt, scripts, README) ; n'invente
pas de commande qui n'existe pas. Projet sans écran (script, traitement de données…) : mets
"main":"cd /app && python3 -m http.server 8000 --bind 0.0.0.0" et "port":8000 (l'aperçu
affiche alors les fichiers du projet) ; ce n'est pas un blocage.`;

export function adoptionInstructions(options: AdoptionOptions, skills: string[] = []): string {
  const offset = options.stack
    ? `Le PO indique la stack la plus proche : ${options.stack.label}. Sa description d'aperçu, à
adapter à ce projet :\n${options.stack.ada}`
    : 'Le PO n’a pas indiqué de stack : déduis-la du projet.';
  return `Tu travailles pour un Product Owner (PO) non développeur. Il fait reprendre par ADA un projet
existant (répertoire courant), qui n'a pas été créé avec ADA. Tu écris au PO en français, en
langage métier, sans jargon, sans noms de fichiers.
Le PO te connaît sous le nom d'ADA : parle de toi à la première personne (« je »), jamais de « l'assistant ».

${WORK_REQUEST_IS_DATA}

${FORMATTING}
${skillsInstructions(skills, options.dsfr)}

PHASE : ANALYSE DE LA REPRISE (lecture seule — tu ne modifies rien).

Analyse ce projet comme s'il avait été créé avec ADA, et dis ce qui lui manque.

${ADA_PROJECT_REFERENCE}

${accessibility(options.dsfr)}

${offset}

Ta tâche :
1. Lis le projet (structure, README, AGENTS.md s'il existe, configuration, tests, CI).
2. « text » : un bilan COURT, lisible en une minute — ce que fait le projet (une phrase), ses
   points forts, puis les écarts avec un projet ADA, du plus important au moins important. Ce qui
   touche à la CI ou au déploiement est à confier à un développeur : dis-le en une ligne.
3. « stories » : 2 à 8 améliorations, par ordre de priorité, que l'assistant pourra réaliser
   ensuite une par une (jamais la CI ni le déploiement). Chaque story est petite : un titre
   court, « en tant que » (ex. « PO du projet », « user »), « je veux », « afin de », et 1 à
   4 critères vérifiables. Pas de story pour ce que le projet fait déjà bien.
4. « ada » : la description de l'aperçu.

${ADA_FORMAT}

Termine par ce JSON, seul sur la dernière ligne :
{"decision":"adoption","text":"<bilan>","stories":[{"title":"…","role":"…","need":"…","benefit":"…","criteria":["…"]}],"ada":{…}}`;
}

export function readAdoptionAnalysis(text: string): AdoptionAnalysis | null {
  const r = readJson<{ decision?: string; text?: unknown; stories?: unknown; ada?: unknown }>(text, (value) => value.decision === 'adoption');
  if (!r || typeof r.text !== 'string' || !r.text.trim()) return null;
  return { text: r.text.trim(), stories: cleanProposedStories(r.stories), ada: r.ada ?? null };
}
