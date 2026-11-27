import { existsSync } from 'node:fs';
import { appendFile, lstat, mkdir, readdir, readFile, realpath, symlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { gitFolderOf } from '../preview/isolated-git.js';
import { isSafeSkill } from './tools.js';

const SKILL_ROOTS = ['.claude/skills', '.agents/skills'];

/**
 * Skills the repository brings itself (adopted project, or files added in a PR): everything
 * that, in `.claude/skills` or `.agents/skills`, is not a link to an ADA skill. They
 * are loaded by the agent like ours, hence subject to the same check: a skill that
 * pre-authorizes tools or runs commands would break the isolation, and the request is
 * refused. A repository skill bearing the name of an ADA skill would take its place unnoticed:
 * ADA does not link it and does not mention it to the agent.
 */
async function repositorySkills(cwd: string, shippedAdaSkills: string[]): Promise<{ name: string; filePath: string; content: string | null }[]> {
  const targets = new Set(shippedAdaSkills);
  const found: { name: string; filePath: string; content: string | null }[] = [];
  for (const root of SKILL_ROOTS) {
    const entries = await readdir(join(cwd, root)).catch(() => [] as string[]);
    for (const name of entries) {
      const filePath = join(cwd, root, name);
      const state = await lstat(filePath).catch(() => null);
      if (!state) continue;
      if (state.isSymbolicLink() && targets.has(await realpath(filePath).catch(() => ''))) continue;
      found.push({ name, filePath, content: await readFile(join(filePath, 'SKILL.md'), 'utf8').catch(() => null) });
    }
  }
  return found;
}

/**
 * Links the configured skills into the project (.claude/skills for Claude Code, .agents/skills
 * for the other agents), locally excluded from git: nothing is committed, the repository stays clean.
 * Returns the names of the available skills.
 */
export async function equipSkills(cwd: string, skills: string[], warnUser: (message: string) => void): Promise<{ names: string[]; folders: string[] }> {
  const available: string[] = [];
  for (const folder of skills) {
    const content = await readFile(join(folder, 'SKILL.md'), 'utf8').catch(() => null);
    if (content === null) continue;
    if (!isSafeSkill(content)) {
      warnUser(`Skill ${basename(folder)} discarded: it pre-authorizes tools or runs commands`);
      continue;
    }
    available.push(folder);
  }
  // Real paths: the agent reads the skill through the link, but the permission applies to the target.
  const actual = await Promise.all(available.map((folder) => realpath(folder)));

  const fromRepository = await repositorySkills(cwd, actual);
  const dangerous = fromRepository.find((skill) => skill.content !== null && !isSafeSkill(skill.content));
  if (dangerous) {
    throw new Error(`Le projet contient une skill « ${dangerous.name} » qui pré-autorise des outils ou exécute des commandes : ADA ne travaille pas avec. Un développeur doit la retirer ou la corriger.`);
  }
  const hidden = new Set(fromRepository.map((skill) => skill.name));
  for (const name of hidden) {
    if (available.some((folder) => basename(folder) === name)) warnUser(`ADA skill ${name} shadowed by a project folder: not linked, not mentioned to the agent`);
  }
  const linked = available.filter((folder) => !hidden.has(basename(folder)));
  if (!linked.length) return { names: [], folders: [] };

  // The git folder of a preview is stored next to the repository (`.git` there is only a pointer file,
  // see isolated-git.ts): this is where git reads its local exclusions.
  const gitFolder = gitFolderOf(cwd);
  const exclusion = join(gitFolder && existsSync(gitFolder) ? gitFolder : join(cwd, '.git'), 'info', 'exclude');
  const excluded = await readFile(exclusion, 'utf8').catch(() => '');
  const toAdd = SKILL_ROOTS.map((root) => `/${root}/`).filter((pattern) => !excluded.split('\n').includes(pattern));
  if (toAdd.length) {
    await mkdir(dirname(exclusion), { recursive: true });
    await appendFile(exclusion, `${excluded && !excluded.endsWith('\n') ? '\n' : ''}${toAdd.join('\n')}\n`);
  }
  for (const root of SKILL_ROOTS) {
    await mkdir(join(cwd, root), { recursive: true });
    for (const folder of linked) {
      const link = join(cwd, root, basename(folder));
      const existing = await lstat(link).catch(() => null);
      if (!existing) await symlink(resolve(folder), link);
    }
  }
  return {
    names: linked.map((folder) => basename(folder)),
    folders: await Promise.all(linked.map((folder) => realpath(folder))),
  };
}
