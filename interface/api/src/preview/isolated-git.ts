import { existsSync, statSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * The repository of a project is mounted in the preview container (`./depot:/app`), where the agent runs
 * free commands. If its `.git` were there, these commands could set a hook or a
 * setting (`core.fsmonitor`, filters…) that git would then run ON THE SERVER, with the rights
 * and the environment of the API. The git folder is therefore stored next to the repository (`<project>/git`),
 * outside the mounted folder, and each git call on the server designates it explicitly: even a
 * `.git` file rewritten from the container is no longer read.
 */
const REPOSITORY_NAME = 'depot';
const GIT_NAME = 'git';

/** Git folder stored next to a repository (`…/depot` → `…/git`), or null if it is not a preview repository. */
export function gitFolderOf(repository: string): string | null {
  return basename(repository) === REPOSITORY_NAME ? join(dirname(repository), GIT_NAME) : null;
}

/** Settings enforced on git on the server: never a hook or a file monitor started by a repository. */
const ENFORCED_SETTINGS: [string, string][] = [
  ['core.hooksPath', '/dev/null'],
  ['core.fsmonitor', 'false'],
];

/** Adds settings through GIT_CONFIG_COUNT/KEY/VALUE, without overwriting those already present (PO's token). */
function withSettings(env: NodeJS.ProcessEnv, settings: [string, string][]): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  const offset = Number(env.GIT_CONFIG_COUNT ?? 0) || 0;
  settings.forEach(([key, value], rank) => {
    next[`GIT_CONFIG_KEY_${offset + rank}`] = key;
    next[`GIT_CONFIG_VALUE_${offset + rank}`] = value;
  });
  next.GIT_CONFIG_COUNT = String(offset + settings.length);
  return next;
}

/**
 * Git environment for a preview repository: git folder and work tree designated, hooks and
 * monitor turned off. No effect (env unchanged) if the repository has no git folder stored next to it.
 */
export function isolatedGitEnvironment(env: NodeJS.ProcessEnv, repository: string): NodeJS.ProcessEnv {
  const gitFolder = gitFolderOf(repository);
  if (!gitFolder || !existsSync(gitFolder)) return env;
  return withSettings({ ...env, GIT_DIR: gitFolder, GIT_WORK_TREE: repository }, ENFORCED_SETTINGS);
}

/**
 * Repository cloned before this change: its `.git` is in the mounted folder. It is moved next to it,
 * its hooks are removed (they may have been set from the container), and `.git` becomes a plain pointer
 * file. No effect for a repository already moved or missing.
 */
export async function isolateGit(repository: string): Promise<void> {
  const gitFolder = gitFolderOf(repository);
  const insideRepository = join(repository, '.git');
  if (!gitFolder || !existsSync(insideRepository) || !statSync(insideRepository).isDirectory()) return;
  if (existsSync(gitFolder)) await rm(gitFolder, { recursive: true, force: true });
  await rename(insideRepository, gitFolder);
  await rm(join(gitFolder, 'hooks'), { recursive: true, force: true });
  await writeFile(insideRepository, `gitdir: ${gitFolder}\n`);
}

/** Server variables that have no place in the agent's environment (it runs commands there). */
const SERVER_SECRETS = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET', 'OBSERVE_APP_KEY', 'OBSERVE_APP_SECRET'];

/** Agent environment: the server's without its secrets, and git locked on the working repository. */
export function agentEnvironment(env: NodeJS.ProcessEnv, repository: string): NodeJS.ProcessEnv {
  const clean = { ...env };
  for (const name of SERVER_SECRETS) delete clean[name];
  return isolatedGitEnvironment(clean, repository);
}
