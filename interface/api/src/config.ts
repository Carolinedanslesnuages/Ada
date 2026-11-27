import { resolve } from 'node:path';
import { z } from 'zod';
import { withLegacyEnv } from './legacy/legacy-env.js';

/** Skills shipped with ADA (paths relative to interface/api); the test bench reads the same list. */
export const SKILLS_SHIPPED_WITH_ADA = [
  '../../skills/externes/dsfr-skill/skills/dsfr-skill',
  '../../skills/externes/agent-skills/skills/dev/bug-investigate',
  '../../skills/externes/agent-skills/skills/repo/repo-perimetre',
  '../../skills/externes/agent-skills/skills/dev/controle-qualite-code',
  // Conventions of the Fabrique numérique (dnum-mi/transversal-doc) useful for writing code;
  // the stack, the CI and the deployment are set by the project template, not by the agent.
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-code-style',
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-client',
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-server',
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-rest-api',
  '../../skills/externes/transversal-doc/.agents/skills/fabnum-project-docs',
  // DINUM (etalab-ia/skills): security (ANSSI guides) and RGAA self-assessment.
  '../../skills/externes/etalab-skills/skills/securite-developpement',
  '../../skills/externes/etalab-skills/skills/rgaa',
].join(',');

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3100),
  /** Public URL of the interface (front), used for the OAuth redirects. */
  INTERFACE_URL: z.string().url().default('http://localhost:5180'),
  /** Personal account or GitHub organization that owns the repositories of the POCs. */
  GITHUB_OWNER: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET : 32 caractères minimum'),
  /**
   * GitHub accounts allowed to sign in, separated by commas.
   * Empty: only GITHUB_OWNER (case of a personal account). Required for an organization.
   */
  ALLOWED_LOGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)),
  /** Folder of the project templates (default: `catalogue/` at the root of ADA's repository). */
  CATALOG: z.string().default(''),
  /** Folder of the `po-` skills shipped in every created project (default: `skills/po/` at the root of ADA's repository). */
  PO_SKILLS: z.string().default(''),
  /**
   * Command of the coding agent (non-interactive mode, stream-json output). Empty: agent disabled.
   * Demo: the Claude Code executable. Replaceable by another agent (see src/agent/agent.ts).
   * A relative path (“./…”, “../…”) is read from interface/api: the agent shipped with ADA is thus
   * configured without a machine-specific path (AGENT_COMMAND=./agent-openai/runner.mjs).
   */
  AGENT_COMMAND: z
    .string()
    .default('')
    .transform((command) => (/^\.{1,2}\//.test(command) ? resolve(process.cwd(), command) : command)),
  /**
   * Agent launched when the user filled in their own model (“My model” page): the one, shipped with ADA,
   * that talks to an OpenAI-compatible gateway. Relative path read from interface/api, like AGENT_COMMAND.
   */
  AGENT_COMMAND_OPENAI: z
    .string()
    .default('./agent-openai/runner.mjs')
    .transform((command) => (/^\.{1,2}\//.test(command) ? resolve(process.cwd(), command) : command)),
  /** Personal models of the users (address, encrypted key, name): one encrypted file per user, outside git. */
  USER_MODELS_DIR: z.string().default('../sessions/modeles-utilisateur'),
  /**
   * Agents working at the same time on the whole machine (one per project at most). The
   * following ones wait for their turn in a queue: each agent uses a container and a CPU.
   */
  AGENT_MAX_CONCURRENT: z.coerce.number().int().min(1).default(3),
  /**
   * Model of the agent (--model option): an alias (“sonnet”, “opus”, “haiku”) or a full
   * name. Empty: the default model of the agent's account.
   */
  AGENT_MODEL: z.string().trim().default(''),
  /**
   * Skills made available to the assistant (paths of folders containing a SKILL.md,
   * separated by commas): linked into the project before each run, never committed.
   * By default, those ADA ships: the DINUM (dsfr-skill) and IA-Generative (agent-skills) repositories
   * are git submodules of `skills/externes/` (paths relative to interface/api). Explicitly
   * empty (AGENT_SKILLS=): no skill.
   */
  AGENT_SKILLS: z
    .string()
    .default(SKILLS_SHIPPED_WITH_ADA)
    .transform((v) => v.split(',').map((filePath) => filePath.trim()).filter(Boolean)),
  /** Index of the RGAA reference (DINUM) attached to every instruction of the assistant. */
  RGAA_INDEX: z.string().default('../../skills/po/po-story/references/rgaa-4.1.2/README.md'),
  /** Encrypted sessions on disk (outside git): a restart signs nobody out. */
  SESSIONS_DIR: z.string().default('../sessions'),
  /** Registry of the projects created or adopted by ADA (file, outside git): the indicators also count
   * the projects archived or deleted since, which GitHub no longer knows. */
  REGISTRY_DIR: z.string().default('../registre'),
  /** Working folder of the previews (clones and containers), outside any git repository. */
  PREVIEWS_DIR: z.string().default('../apercus'),
  /**
   * Public address of the demo links, `{projet}` and `{port}` replaced. Online:
   * a proxy (wildcard domain) forwards to the port of each demo, e.g.
   * https://{projet}.demo.ada.gouv.fr. By default: ADA's machine.
   */
  DEMO_URL: z.string().default('http://localhost:{port}'),
  WORKSHOP_TOPIC: z.string().default('ada'),
});

export type Config = z.infer<typeof schema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(withLegacyEnv(env));
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join('.')} : ${i.message}`)
      .join('\n');
    throw new Error(`Configuration incomplète (voir api/.env.example) :\n${details}`);
  }
  return result.data;
}

export const CONFIG = Symbol('CONFIG');

export function isLoginAllowed(config: Config, login: string): boolean {
  const list = config.ALLOWED_LOGINS.length
    ? config.ALLOWED_LOGINS
    : [config.GITHUB_OWNER.toLowerCase()];
  return list.includes(login.toLowerCase());
}
