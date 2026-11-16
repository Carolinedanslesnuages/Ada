import { z } from 'zod';

/**
 * Les stories et problèmes sont écrits par le PO dans GitHub (formulaires d'issue
 * user-story.yml et bug.yml des projets). L'atelier les lit, vérifie qu'ils sont prêts,
 * et les lance un par un.
 */
export const CRITERES_MAX = 4;
export const LABEL_STORY = 'user-story';
export const LABEL_BUG = 'bug';
/** Demande libre (« mode sauvage ») : un prompt du PO, hors story, enregistré comme issue. */
export const LABEL_LIBRE = 'mode-libre';
const MARQUEUR_LIBRE = '<!-- ada:mode-libre -->';
export const PROMPT_MIN = 10;
export const PROMPT_MAX = 1000;

export const STATUTS = {
  'en-cours': 'story:en-cours',
  questions: 'story:questions',
  'plan-a-valider': 'story:plan-a-valider',
  'en-verification': 'story:en-verification',
  'besoin-dev': 'story:besoin-dev',
} as const;

export type Statut = 'nouvelle' | keyof typeof STATUTS | 'livree';
export type TypeDemande = 'story' | 'bug' | 'libre';

/** Statuts qui occupent le projet : tant qu'une demande y est, on n'en lance pas d'autre. */
export const STATUTS_ACTIFS: Statut[] = ['en-cours', 'questions', 'plan-a-valider', 'en-verification', 'besoin-dev'];

export interface ContenuStory {
  role: string;
  besoin: string;
  benefice: string;
  criteres: string[];
}

export interface ContenuBug {
  constate: string;
  attendu: string;
  etapes: string;
  ecran: string;
}

/** Sections « ### Titre » d'une issue créée avec un formulaire GitHub. */
function sectionsFormulaire(corps: string): Map<string, string> {
  const sections = new Map<string, string>();
  for (const morceau of corps.split(/^### /m).slice(1)) {
    const [titre, ...reste] = morceau.split('\n');
    const valeur = reste.join('\n').trim();
    sections.set((titre ?? '').trim().toLowerCase(), valeur === '_No response_' ? '' : valeur);
  }
  return sections;
}

const listeCriteres = (texte: string) =>
  texte
    .split('\n')
    .map((l) => l.replace(/^\s*(- \[[ x]\]|[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

export function lireStory(corps: string): ContenuStory | null {
  const f = sectionsFormulaire(corps);
  if (!f.has('en tant que')) return null;
  const critere = [...f.keys()].find((k) => k.startsWith('critères') || k.startsWith('criteres'));
  return {
    role: f.get('en tant que') ?? '',
    besoin: f.get('je veux') ?? '',
    benefice: f.get('afin de') ?? '',
    criteres: critere ? listeCriteres(f.get(critere) ?? '') : [],
  };
}

/** Corps de l'issue créée pour un prompt : lisible sur GitHub, relisible par ADA. */
export function formaterPrompt(texte: string): string {
  return ['### Demande libre (mode sauvage, hors story)', '', texte.trim(), '', MARQUEUR_LIBRE].join('\n');
}

export function lirePrompt(corps: string): string | null {
  if (!corps.includes(MARQUEUR_LIBRE)) return null;
  return sectionsFormulaire(corps).get('demande libre (mode sauvage, hors story)')?.replace(MARQUEUR_LIBRE, '').trim() ?? null;
}

/** Titre de l'issue : le début du prompt, coupé proprement. */
export function titrePrompt(texte: string): string {
  const ligne = texte.trim().split('\n')[0]!.replace(/\s+/g, ' ');
  return `Demande libre : ${ligne.length > 60 ? `${ligne.slice(0, 57).trimEnd()}…` : ligne}`;
}

export function verifierPrompt(texte: unknown): { ok: true; texte: string } | { ok: false; erreur: string } {
  const propre = typeof texte === 'string' ? texte.trim() : '';
  if (propre.length < PROMPT_MIN) return { ok: false, erreur: 'Décrivez votre demande en une phrase au moins' };
  if (propre.length > PROMPT_MAX) {
    return { ok: false, erreur: `${PROMPT_MAX} caractères au maximum : pour une demande plus importante, écrivez des stories` };
  }
  return { ok: true, texte: propre };
}

export function lireBug(corps: string): ContenuBug | null {
  const f = sectionsFormulaire(corps);
  if (!f.has('ce qui se passe')) return null;
  return {
    constate: f.get('ce qui se passe') ?? '',
    attendu: f.get('ce qui devrait se passer') ?? '',
    etapes: f.get('comment le reproduire') ?? '',
    ecran: f.get('écran ou adresse concerné') ?? '',
  };
}

const rempli = (min: number, message: string) => z.string().trim().min(min, message);

const schemaStory = z.object({
  role: rempli(3, 'Le champ « En tant que » est vide'),
  besoin: rempli(5, 'Le champ « Je veux » est vide'),
  benefice: rempli(5, 'Le champ « Afin de » est vide'),
  criteres: z
    .array(z.string())
    .min(1, 'Aucun critère d’acceptation')
    .max(CRITERES_MAX, `Plus de ${CRITERES_MAX} critères : découpez-la en plusieurs stories sur GitHub`),
});

const schemaBug = z.object({
  constate: rempli(5, 'Le champ « Ce qui se passe » est vide'),
  attendu: rempli(5, 'Le champ « Ce qui devrait se passer » est vide'),
  etapes: rempli(5, 'Le champ « Comment le reproduire » est vide'),
});

/** Une demande ne se lance que si elle est complète et assez petite. */
export function verifierPrete(
  type: TypeDemande,
  story: ContenuStory | null,
  bug: ContenuBug | null,
  prompt: string | null = null,
): { prete: true } | { prete: false; raison: string } {
  if (type === 'libre') {
    const r = verifierPrompt(prompt);
    return r.ok ? { prete: true } : { prete: false, raison: r.erreur };
  }
  if (type === 'story') {
    if (!story) return { prete: false, raison: 'Story écrite hors du formulaire « User story » de GitHub' };
    const r = schemaStory.safeParse(story);
    return r.success ? { prete: true } : { prete: false, raison: r.error.issues[0]!.message };
  }
  if (!bug) return { prete: false, raison: 'Problème écrit hors du formulaire « Signaler un problème » de GitHub' };
  const r = schemaBug.safeParse(bug);
  return r.success ? { prete: true } : { prete: false, raison: r.error.issues[0]!.message };
}

export function statutDepuis(etat: 'open' | 'closed', labels: string[]): Statut {
  if (etat === 'closed') return 'livree';
  const trouve = (Object.keys(STATUTS) as (keyof typeof STATUTS)[]).find((s) => labels.includes(STATUTS[s]));
  return trouve ?? 'nouvelle';
}

/**
 * Story ou problème ? D'abord le label ; sinon le contenu du formulaire (le formulaire GitHub
 * ne pose son label que si celui-ci existe déjà dans le dépôt). null : ni l'un ni l'autre.
 */
export function typeDepuis(labels: string[], corps = ''): TypeDemande | null {
  if (labels.includes(LABEL_LIBRE) || corps.includes(MARQUEUR_LIBRE)) return 'libre';
  if (labels.includes(LABEL_BUG)) return 'bug';
  if (labels.includes(LABEL_STORY)) return 'story';
  if (lireStory(corps)) return 'story';
  if (lireBug(corps)) return 'bug';
  return null;
}
