import { z } from 'zod';
import { summarizePrompt } from '../stories/story.js';

/** Idea told freely at creation: long if needed, without an imposed format (#68). */
export const MAX_IDEA_LENGTH = 4000;

/** Markers present in the templates, replaced when a project is created. */
export interface ProjectValues {
  name: string;
  /** Short sentence under the service name in the DSFR header; empty = none. */
  baseline: string;
  slug: string;
  objective: string;
  date: string;
  po: string;
}

/** Straight apostrophe → typographic, spaces normalized (the name is injected into HTML, TS, YAML). */
export function normalizeName(name: string): string {
  return name.replace(/'/g, '’').replace(/\s+/g, ' ').trim();
}

/** Name of the GitHub repository: lowercase, no accents, dashes. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    // Runs of separators are already collapsed to a single dash: no quantifier needed (linear time).
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '');
}

const schema = z.object({
  name: z
    .string()
    .transform(normalizeName)
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
  /** Optional as soon as an idea is told: then deduced from its first sentence. */
  objective: z
    .string()
    .optional()
    .default('')
    .transform((o) => o.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(300, '300 caractères au maximum')),
  /** The PO's idea, as it comes (even brief or disjointed): first request of the project. */
  idea: z
    .string()
    .optional()
    .default('')
    .transform((text) => text.trim())
    .pipe(z.string().max(MAX_IDEA_LENGTH, `${MAX_IDEA_LENGTH} caractères au maximum`)),
  template: z.string().min(1, 'Choisissez une stack'),
  /** Visibility of the GitHub repository chosen by the PO: private by default, or public (visible to all). */
  visibility: z.enum(['private', 'public']).optional().default('private'),
  /** The PO plans to deploy the project: the template's Helm chart is added. */
  deployed: z.boolean().optional().default(false),
  baseline: z
    .string()
    .optional()
    .default('')
    .transform(normalizeName)
    .pipe(
      z
        .string()
        .max(80, '80 caractères au maximum')
        .regex(/^[\p{L}\p{N} ’.,!?:;()«»-]*$/u, 'Lettres, chiffres, espaces et ponctuation simple uniquement'),
    ),
})
  .superRefine((project, ctx) => {
    if (!project.idea && !project.objective) {
      ctx.addIssue({ code: 'custom', path: ['idea'], message: 'Racontez votre idée, même en quelques mots' });
    } else if (project.idea && project.idea.length < 10) {
      ctx.addIssue({ code: 'custom', path: ['idea'], message: 'Quelques mots de plus : une phrase au moins' });
    }
    if (project.objective && project.objective.length < 10) {
      ctx.addIssue({ code: 'custom', path: ['objective'], message: 'Décrivez l’objectif en une ou deux phrases' });
    }
  })
  .transform((project) => {
    const objective = project.objective || summarizePrompt(project.idea, 290);
    return { ...project, objective: /[.!?…]$/.test(objective) ? objective : `${objective}.` };
  });

export type NewProject = z.output<typeof schema>;
export type ProjectErrors = Partial<Record<keyof NewProject, string>>;

export function validateProject(
  data: unknown,
): { ok: true; project: NewProject; slug: string } | { ok: false; errors: ProjectErrors } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors: ProjectErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof NewProject;
      errors[field] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const slug = slugify(result.data.name);
  if (slug.length < 3) return { ok: false, errors: { name: 'Le nom doit contenir au moins 3 lettres ou chiffres' } };
  return { ok: true, project: result.data, slug };
}

export function customize(text: string, v: ProjectValues): string {
  return text
    .replaceAll('__NOM_PROJET__', v.name)
    .replaceAll('__BASELINE__', v.baseline)
    .replaceAll('__SLUG__', v.slug)
    .replaceAll('__OBJECTIF__', v.objective)
    .replaceAll('__DATE__', v.date)
    .replaceAll('__PO__', v.po);
}
