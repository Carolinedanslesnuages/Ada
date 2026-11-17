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
  /** L'assistant a proposé un découpage : le PO choisit les stories à créer (#36). */
  decoupage: 'story:decoupage-a-valider',
  /** Demande découpée : ses stories se réalisent une par une ; elle se ferme quand toutes sont livrées. */
  parent: 'story:parent',
} as const;

export type Statut = 'nouvelle' | keyof typeof STATUTS | 'livree';
export type TypeDemande = 'story' | 'bug' | 'libre';

/** Statuts qui occupent le projet : tant qu'une demande y est, on n'en lance pas d'autre. */
export const STATUTS_ACTIFS: Statut[] = ['en-cours', 'questions', 'plan-a-valider', 'en-verification', 'besoin-dev', 'decoupage'];

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
export const PREFIXE_LIBRE = 'Demande libre : ';
const TITRE_LIBRE_MAX = 72;

/**
 * Titre court d'un prompt : sa première proposition (jusqu'au premier « . », « ! », « ? », « ; »
 * ou « : »), coupée entre deux mots si elle reste trop longue. Il devient le titre de l'issue puis,
 * sans le préfixe, celui de la PR et la ligne des notes de version.
 */
export function resumerPrompt(texte: string, max = TITRE_LIBRE_MAX): string {
  const ligne = texte.trim().split('\n')[0]!.replace(/\s+/g, ' ');
  const proposition = (ligne.split(/(?<=[.!?;])\s|\s:\s|\s?:\s/)[0] ?? ligne).replace(/[.;:]$/, '').trim() || ligne;
  if (proposition.length <= max) return proposition;
  const coupe = proposition.slice(0, max - 1);
  const dernierEspace = coupe.lastIndexOf(' ');
  return `${(dernierEspace > max / 2 ? coupe.slice(0, dernierEspace) : coupe).trimEnd()}…`;
}

export function titrePrompt(texte: string): string {
  return `${PREFIXE_LIBRE}${resumerPrompt(texte)}`;
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

/* ---------- Découpage d'une demande en stories (#36) ---------- */

/** Story proposée par l'assistant quand une demande est trop grosse. */
export interface StoryProposee {
  titre: string;
  role: string;
  besoin: string;
  benefice: string;
  criteres: string[];
}

export const MARQUEUR_DECOUPAGE = 'ada:decoupage';
const DONNEES_DECOUPAGE = /<!-- ada:decoupage (\S+) -->/;
const SECTION_PARENT = '### Demande parent';
const SECTION_DECOUPAGE = '### Découpage';

const texteCourt = (valeur: unknown, maximum: number) => (typeof valeur === 'string' ? valeur.trim().slice(0, maximum) : '');

/** Ne garde que des stories complètes : 2 à 8, chacune 1 à CRITERES_MAX critères. */
export function nettoyerStoriesProposees(brut: unknown): StoryProposee[] {
  if (!Array.isArray(brut)) return [];
  const stories = brut
    .map((element) => (element ?? {}) as Record<string, unknown>)
    .map((element) => ({
      titre: texteCourt(element.titre, 120),
      role: texteCourt(element.role, 200),
      besoin: texteCourt(element.besoin, 600),
      benefice: texteCourt(element.benefice, 600),
      criteres: (Array.isArray(element.criteres) ? element.criteres : [])
        .map((critere) => texteCourt(critere, 300))
        .filter(Boolean)
        .slice(0, CRITERES_MAX),
    }))
    .filter((story) => story.titre && story.role && story.besoin && story.benefice && story.criteres.length > 0)
    .slice(0, 8);
  return stories.length >= 2 ? stories : [];
}

/** Commentaire « Découpage proposé » : lisible sur GitHub, et relisible par ADA (données cachées). */
export function texteDecoupage(explication: string, stories: StoryProposee[]): string {
  const lisible = stories
    .map(
      (story, rang) =>
        `${rang + 1}. **${story.titre}** — en tant que ${story.role}, je veux ${story.besoin}, afin de ${story.benefice}.\n` +
        story.criteres.map((critere) => `   - ${critere}`).join('\n'),
    )
    .join('\n');
  const donnees = Buffer.from(JSON.stringify(stories), 'utf8').toString('base64');
  return `${explication}\n\n**Stories proposées** (à choisir dans ADA) :\n${lisible}\n\n<!-- ${MARQUEUR_DECOUPAGE} ${donnees} -->`;
}

export function lireDecoupage(texte: string): StoryProposee[] {
  const donnees = DONNEES_DECOUPAGE.exec(texte)?.[1];
  if (!donnees) return [];
  try {
    return nettoyerStoriesProposees(JSON.parse(Buffer.from(donnees, 'base64').toString('utf8')));
  } catch {
    return [];
  }
}

/** Corps d'une story créée par ADA : celui du formulaire de story, plus le lien vers la demande parent. */
export function formaterStory(story: StoryProposee, parent: number): string {
  return [
    '### En tant que',
    '',
    story.role,
    '',
    '### Je veux',
    '',
    story.besoin,
    '',
    '### Afin de',
    '',
    story.benefice,
    '',
    "### Critères d'acceptation",
    '',
    ...story.criteres.map((critere) => `- ${critere}`),
    '',
    SECTION_PARENT,
    '',
    `#${parent} — story créée depuis ADA, à partir du découpage proposé par l’assistant.`,
  ].join('\n');
}

/** Numéro de la demande parent d'une story créée par découpage ; null sinon. */
export function lireParent(corps: string): number | null {
  const section = corps.split(SECTION_PARENT)[1];
  const numero = section ? /#(\d+)/.exec(section)?.[1] : undefined;
  return numero ? Number(numero) : null;
}

/** Ajoute au corps de la demande parent la liste de ses stories, en cases à cocher. */
export function ajouterDecoupage(corps: string, enfants: { numero: number; titre: string }[]): string {
  const liste = enfants.map((enfant) => `- [ ] #${enfant.numero} ${enfant.titre}`).join('\n');
  return `${corps.trimEnd()}\n\n${SECTION_DECOUPAGE}\n\nDemande découpée en ${enfants.length} stories, réalisées une par une. Chaque case se coche quand la story est livrée.\n\n${liste}\n`;
}

/** Coche la story livrée dans le corps du parent ; dit si toutes ses stories le sont. */
export function cocherEnfant(corps: string, numero: number): { corps: string; toutesLivrees: boolean } {
  const coche = corps.replace(new RegExp(`^- \\[ \\] #${numero}(?=\\s)`, 'm'), `- [x] #${numero}`);
  const section = coche.split(SECTION_DECOUPAGE)[1] ?? '';
  return { corps: coche, toutesLivrees: /^- \[x\] #\d+/m.test(section) && !/^- \[ \] #\d+/m.test(section) };
}
