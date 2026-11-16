import { z } from 'zod';

export const CRITERES_MAX = 4;
export const LABEL_STORY = 'user-story';
const MARQUEUR = '<!-- atelier-po:story v1 -->';

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

export function lireCorps(corps: string): Omit<NouvelleStory, 'titre'> | null {
  if (!corps.includes(MARQUEUR)) return null;
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

export function statutDepuis(etat: 'open' | 'closed', labels: string[]): Statut {
  if (etat === 'closed') return 'livree';
  const trouve = (Object.keys(STATUTS) as (keyof typeof STATUTS)[]).find((s) =>
    labels.includes(STATUTS[s]),
  );
  return trouve ?? 'nouvelle';
}
