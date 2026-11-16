import { z } from 'zod';

export const CRITERES_MAX = 4;
export const LABEL_STORY = 'user-story';
export const LABEL_BUG = 'bug';
const MARQUEUR = '<!-- atelier-po:story v1 -->';
const MARQUEUR_BUG = '<!-- atelier-po:bug v1 -->';

export type TypeDemande = 'story' | 'bug';

export const STATUTS = {
  questions: 'story:questions',
  'plan-a-valider': 'story:plan-a-valider',
  'en-cours': 'story:en-cours',
  'en-verification': 'story:en-verification',
  'besoin-dev': 'story:besoin-dev',
} as const;

export type Statut = 'nouvelle' | keyof typeof STATUTS | 'livree';

const texte = (min: number, max: number, vide: string) =>
  z.string().trim().min(min, vide).max(max, `${max} caractères au maximum`);

const schema = z.object({
  titre: texte(5, 80, 'Donnez un titre court à la story (5 caractères minimum)'),
  role: texte(3, 120, 'Indiquez qui a ce besoin (« En tant que… »)'),
  besoin: texte(5, 300, 'Décrivez ce que la personne veut faire (« je veux… »)'),
  benefice: texte(5, 300, 'Indiquez à quoi ça lui sert (« afin de… »)'),
  criteres: z
    .array(z.string().trim())
    .transform((liste) => liste.filter((c) => c.length > 0))
    .pipe(
      z
        .array(z.string().min(3).max(200, '200 caractères au maximum par critère'))
        .min(1, 'Ajoutez au moins un critère d’acceptation')
        .max(
          CRITERES_MAX,
          `${CRITERES_MAX} critères au maximum : au-delà, découpez en plusieurs stories`,
        ),
    ),
});

export type NouvelleStory = z.output<typeof schema>;
export type ErreursStory = Partial<Record<keyof NouvelleStory, string>>;
export type ResultatValidation =
  | { ok: true; story: NouvelleStory }
  | { ok: false; erreurs: ErreursStory };

export function validerStory(donnees: unknown): ResultatValidation {
  const resultat = schema.safeParse(donnees);
  if (resultat.success) return { ok: true, story: resultat.data };
  const erreurs: ErreursStory = {};
  for (const probleme of resultat.error.issues) {
    const champ = probleme.path[0] as keyof NouvelleStory;
    erreurs[champ] ??= probleme.message;
  }
  return { ok: false, erreurs };
}

export function formaterCorps(story: NouvelleStory): string {
  return [
    `**En tant que** ${story.role},`,
    `**je veux** ${story.besoin},`,
    `**afin de** ${story.benefice}.`,
    '',
    '### Critères d’acceptation',
    ...story.criteres.map((c) => `- [ ] ${c}`),
    '',
    MARQUEUR,
  ].join('\n');
}

/** Sections « ### Titre » d'une issue créée avec un formulaire GitHub (.github/ISSUE_TEMPLATE). */
function sectionsFormulaire(corps: string): Map<string, string> {
  const sections = new Map<string, string>();
  const morceaux = corps.split(/^### /m).slice(1);
  for (const morceau of morceaux) {
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

export function lireCorps(corps: string): Omit<NouvelleStory, 'titre'> | null {
  if (corps.includes(MARQUEUR)) {
    const ligne = (prefixe: string, fin: string) => {
      const l = corps.split('\n').find((x) => x.startsWith(prefixe));
      return l ? l.slice(prefixe.length).replace(new RegExp(`${fin}$`), '').trim() : '';
    };
    return {
      role: ligne('**En tant que**', ','),
      besoin: ligne('**je veux**', ','),
      benefice: ligne('**afin de**', '\\.'),
      criteres: corps
        .split('\n')
        .filter((l) => /^- \[[ x]\] /.test(l))
        .map((l) => l.slice(6).trim()),
    };
  }
  const f = sectionsFormulaire(corps);
  if (!f.has('en tant que')) return null;
  const critere = [...f.keys()].find((k) => k.startsWith('critères'));
  return {
    role: f.get('en tant que') ?? '',
    besoin: f.get('je veux') ?? '',
    benefice: f.get('afin de') ?? '',
    criteres: critere ? listeCriteres(f.get(critere) ?? '') : [],
  };
}

export function statutDepuis(etat: 'open' | 'closed', labels: string[]): Statut {
  if (etat === 'closed') return 'livree';
  const trouve = (Object.keys(STATUTS) as (keyof typeof STATUTS)[]).find((s) =>
    labels.includes(STATUTS[s]),
  );
  return trouve ?? 'nouvelle';
}

const schemaBug = z.object({
  titre: texte(5, 80, 'Donnez un titre court au problème (5 caractères minimum)'),
  constate: texte(5, 1000, 'Décrivez ce qui se passe'),
  attendu: texte(5, 1000, 'Décrivez ce qui devrait se passer'),
  etapes: texte(5, 1000, 'Indiquez comment reproduire le problème'),
  ecran: z.string().trim().max(200).default(''),
});

export type NouveauBug = z.output<typeof schemaBug>;
export type ErreursBug = Partial<Record<keyof NouveauBug, string>>;

export function validerBug(
  donnees: unknown,
): { ok: true; bug: NouveauBug } | { ok: false; erreurs: ErreursBug } {
  const resultat = schemaBug.safeParse(donnees);
  if (resultat.success) return { ok: true, bug: resultat.data };
  const erreurs: ErreursBug = {};
  for (const probleme of resultat.error.issues) {
    const champ = probleme.path[0] as keyof NouveauBug;
    erreurs[champ] ??= probleme.message;
  }
  return { ok: false, erreurs };
}

/** Même mise en page que le formulaire GitHub bug.yml : lisible des deux côtés. */
export function formaterCorpsBug(bug: NouveauBug): string {
  return [
    '### Ce qui se passe',
    '',
    bug.constate,
    '',
    '### Ce qui devrait se passer',
    '',
    bug.attendu,
    '',
    '### Comment le reproduire',
    '',
    bug.etapes,
    '',
    '### Écran ou adresse concerné',
    '',
    bug.ecran || '_No response_',
    '',
    MARQUEUR_BUG,
  ].join('\n');
}

export function lireCorpsBug(corps: string): Omit<NouveauBug, 'titre'> | null {
  const f = sectionsFormulaire(corps);
  if (!f.has('ce qui se passe')) return null;
  return {
    constate: f.get('ce qui se passe') ?? '',
    attendu: f.get('ce qui devrait se passer') ?? '',
    etapes: f.get('comment le reproduire') ?? '',
    ecran: (f.get('écran ou adresse concerné') ?? '').replace(MARQUEUR_BUG, '').trim(),
  };
}

export function typeDepuis(labels: string[]): TypeDemande {
  return labels.includes(LABEL_BUG) ? 'bug' : 'story';
}
