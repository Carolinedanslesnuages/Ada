import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3100),
  /** URL publique de l'interface (front), utilisée pour les redirections OAuth. */
  URL_INTERFACE: z.string().url().default('http://localhost:5180'),
  /** Compte personnel ou organisation GitHub qui possède les dépôts des POC. */
  GITHUB_PROPRIETAIRE: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET : 32 caractères minimum'),
  /** Topic GitHub qui distingue les dépôts créés par l'atelier. */
  TOPIC_ATELIER: z.string().default('atelier-po'),
});

export type Config = z.infer<typeof schema>;

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultat = schema.safeParse(env);
  if (!resultat.success) {
    const details = resultat.error.issues
      .map((i) => `  - ${i.path.join('.')} : ${i.message}`)
      .join('\n');
    throw new Error(`Configuration incomplète (voir api/.env.example) :\n${details}`);
  }
  return resultat.data;
}

export const CONFIG = Symbol('CONFIG');
