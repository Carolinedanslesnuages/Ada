import { resolve } from 'node:path';
import { z } from 'zod';

const SKILLS_LIVREES_AVEC_ADA = [
  '../../skills/externes/dsfr-skill/skills/dsfr-skill',
  '../../skills/externes/agent-skills/skills/dev/bug-investigate',
  '../../skills/externes/agent-skills/skills/repo/repo-perimetre',
  '../../skills/externes/agent-skills/skills/dev/controle-qualite-code',
  // Conventions de la Fabrique numérique (dnum-mi/transversal-doc) utiles à l'écriture du code ;
  // la stack, la CI et le déploiement sont fixés par le modèle du projet, pas par l'agent.
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-code-style',
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-client',
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-server',
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-rest-api',
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-project-docs',
  // DINUM (etalab-ia/skills) : sécurité (guides de l'ANSSI) et auto-évaluation RGAA.
  '../../skills/externes/etalab-skills/skills/securite-developpement',
  '../../skills/externes/etalab-skills/skills/rgaa',
].join(',');

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
  /**
   * Comptes GitHub autorisés à se connecter, séparés par des virgules.
   * Vide : seul GITHUB_PROPRIETAIRE (cas d'un compte personnel). Obligatoire pour une organisation.
   */
  LOGINS_AUTORISES: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)),
  /** Dossier des modèles de projet (défaut : `catalogue/` à la racine du dépôt d'ADA). */
  CATALOGUE: z.string().default(''),
  /** Dossier des skills `po-` livrées dans chaque projet créé (défaut : `skills/po/` à la racine du dépôt d'ADA). */
  SKILLS_PO: z.string().default(''),
  /**
   * Commande de l'agent de code (mode non interactif, sortie stream-json). Vide : agent désactivé.
   * Démo : l'exécutable Claude Code. Remplaçable par un autre agent (voir src/agent/agent.ts).
   * Un chemin relatif (« ./… », « ../… ») est lu depuis interface/api : l'agent livré avec ADA se règle
   * donc sans chemin propre à un poste (AGENT_COMMANDE=./agent-openai/runner.mjs).
   */
  AGENT_COMMANDE: z
    .string()
    .default('')
    .transform((commande) => (/^\.{1,2}\//.test(commande) ? resolve(process.cwd(), commande) : commande)),
  /**
   * Agent lancé quand l'utilisateur a renseigné son propre modèle (page « Mon modèle ») : celui, livré avec ADA,
   * qui parle à une passerelle compatible OpenAI. Chemin relatif lu depuis interface/api, comme AGENT_COMMANDE.
   */
  AGENT_COMMANDE_OPENAI: z
    .string()
    .default('./agent-openai/runner.mjs')
    .transform((commande) => (/^\.{1,2}\//.test(commande) ? resolve(process.cwd(), commande) : commande)),
  /** Modèles personnels des utilisateurs (adresse, clé chiffrée, nom) : un fichier chiffré par utilisateur, hors git. */
  DOSSIER_MODELES: z.string().default('../sessions/modeles-utilisateur'),
  /**
   * Agents qui travaillent en même temps sur toute la machine (un par projet au plus). Les
   * suivants attendent leur tour dans une file : chaque agent mobilise un conteneur et un processeur.
   */
  AGENT_MAX_SIMULTANES: z.coerce.number().int().min(1).default(3),
  /**
   * Modèle de l'agent (option --model) : un alias (« sonnet », « opus », « haiku ») ou un nom
   * complet. Vide : le modèle par défaut du compte de l'agent.
   */
  AGENT_MODELE: z.string().trim().default(''),
  /**
   * Skills mises à disposition de l'assistant (chemins de dossiers contenant un SKILL.md,
   * séparés par des virgules) : reliées dans le projet avant chaque exécution, jamais commitées.
   * Par défaut, celles que livre ADA : les dépôts DINUM (dsfr-skill) et IA-Generative (agent-skills)
   * sont des sous-modules git de `skills/externes/` (chemins relatifs à interface/api). Vide
   * explicitement (AGENT_SKILLS=) : aucune skill.
   */
  AGENT_SKILLS: z
    .string()
    .default(SKILLS_LIVREES_AVEC_ADA)
    .transform((v) => v.split(',').map((chemin) => chemin.trim()).filter(Boolean)),
  /** Index du référentiel RGAA (DINUM) joint à chaque consigne de l'assistant. */
  RGAA_INDEX: z.string().default('../../skills/po/po-story/references/rgaa-4.1.2/README.md'),
  /** Sessions chiffrées sur disque (hors git) : un redémarrage ne déconnecte personne. */
  DOSSIER_SESSIONS: z.string().default('../sessions'),
  /** Registre des projets créés ou repris par ADA (fichier, hors git) : les indicateurs comptent
   * aussi les projets archivés ou supprimés depuis, que GitHub ne connaît plus. */
  DOSSIER_REGISTRE: z.string().default('../registre'),
  /** Dossier de travail des aperçus (clones et conteneurs), hors de tout dépôt git. */
  DOSSIER_APERCUS: z.string().default('../apercus'),
  /**
   * Adresse publique des liens de démonstration, `{projet}` et `{port}` remplacés. En ligne :
   * un proxy (domaine générique) renvoie vers le port de chaque démo, ex.
   * https://{projet}.demo.ada.gouv.fr. Par défaut : la machine d'ADA.
   */
  URL_DEMO: z.string().default('http://localhost:{port}'),
  TOPIC_ATELIER: z.string().default('ada'),
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

export function loginAutorise(config: Config, login: string): boolean {
  const liste = config.LOGINS_AUTORISES.length
    ? config.LOGINS_AUTORISES
    : [config.GITHUB_PROPRIETAIRE.toLowerCase()];
  return liste.includes(login.toLowerCase());
}
