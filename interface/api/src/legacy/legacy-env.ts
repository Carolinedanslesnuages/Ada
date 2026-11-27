/**
 * Environment variables named in French before the switch to English: an `.env` written earlier
 * keeps working. A variable set under its current name always wins.
 */
const LEGACY_VARIABLES: Record<string, string> = {
  GITHUB_PROPRIETAIRE: 'GITHUB_OWNER',
  URL_INTERFACE: 'INTERFACE_URL',
  LOGINS_AUTORISES: 'ALLOWED_LOGINS',
  CATALOGUE: 'CATALOG',
  SKILLS_PO: 'PO_SKILLS',
  AGENT_COMMANDE: 'AGENT_COMMAND',
  AGENT_COMMANDE_OPENAI: 'AGENT_COMMAND_OPENAI',
  DOSSIER_MODELES: 'USER_MODELS_DIR',
  AGENT_MAX_SIMULTANES: 'AGENT_MAX_CONCURRENT',
  AGENT_MODELE: 'AGENT_MODEL',
  DOSSIER_SESSIONS: 'SESSIONS_DIR',
  DOSSIER_REGISTRE: 'REGISTRY_DIR',
  DOSSIER_APERCUS: 'PREVIEWS_DIR',
  URL_DEMO: 'DEMO_URL',
  TOPIC_ATELIER: 'WORKSHOP_TOPIC',
};

/** The environment with every legacy variable copied to its current name, when that one is not set. */
export function withLegacyEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const current: NodeJS.ProcessEnv = { ...env };
  for (const [legacyName, currentName] of Object.entries(LEGACY_VARIABLES)) {
    if (current[currentName] === undefined && env[legacyName] !== undefined) current[currentName] = env[legacyName];
  }
  return current;
}
