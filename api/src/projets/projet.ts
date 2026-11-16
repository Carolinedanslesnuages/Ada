import { z } from 'zod';

/** Marqueurs présents dans les dépôts modèles, remplacés à la création d'un projet. */
export interface ValeursProjet {
  nom: string;
  slug: string;
  objectif: string;
  date: string;
  po: string;
}

/** Apostrophe droite → typographique, espaces normalisés (le nom est injecté dans du HTML, du TS, du YAML). */
export function normaliserNom(nom: string): string {
  return nom.replace(/'/g, '’').replace(/\s+/g, ' ').trim();
}

/** Nom du dépôt GitHub : minuscules, sans accents, tirets. */
export function slugifier(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

const schema = z.object({
  nom: z
    .string()
    .transform(normaliserNom)
    .pipe(
      z
        .string()
        .min(3, 'Le nom doit faire au moins 3 caractères')
        .max(60, '60 caractères au maximum')
        .regex(
          /^[\p{L}\p{N}][\p{L}\p{N} ’-]*$/u,
          'Lettres, chiffres, espaces, tirets et apostrophes uniquement',
        ),
    ),
  objectif: z
    .string()
    .transform((o) => o.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(10, 'Décrivez l’objectif en une ou deux phrases').max(300, '300 caractères au maximum'))
    .transform((o) => (/[.!?]$/.test(o) ? o : `${o}.`)),
  modele: z.string().min(1, 'Choisissez une stack'),
});

export type NouveauProjet = z.output<typeof schema>;
export type ErreursProjet = Partial<Record<keyof NouveauProjet, string>>;

export function validerProjet(
  donnees: unknown,
): { ok: true; projet: NouveauProjet; slug: string } | { ok: false; erreurs: ErreursProjet } {
  const resultat = schema.safeParse(donnees);
  if (!resultat.success) {
    const erreurs: ErreursProjet = {};
    for (const probleme of resultat.error.issues) {
      const champ = probleme.path[0] as keyof NouveauProjet;
      erreurs[champ] ??= probleme.message;
    }
    return { ok: false, erreurs };
  }
  const slug = slugifier(resultat.data.nom);
  if (slug.length < 3) return { ok: false, erreurs: { nom: 'Le nom doit contenir au moins 3 lettres ou chiffres' } };
  return { ok: true, projet: resultat.data, slug };
}

export function personnaliser(texte: string, v: ValeursProjet): string {
  return texte
    .replaceAll('__NOM_PROJET__', v.nom)
    .replaceAll('__SLUG__', v.slug)
    .replaceAll('__OBJECTIF__', v.objectif)
    .replaceAll('__DATE__', v.date)
    .replaceAll('__PO__', v.po);
}
