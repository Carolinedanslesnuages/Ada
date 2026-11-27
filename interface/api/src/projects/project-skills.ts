/**
 * ADA's `po-` skills shipped in every created project: the PO's repository itself carries the method
 * (story, bug report, new project), readable by any coding agent, not only ADA's.
 * Folder common to Codex, OpenCode, Cursor, Copilot and Gemini CLI; relative links for Claude Code.
 */
import { cp, mkdir, readdir, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';

const COMMON_DIR = '.agents/skills';
const CLAUDE_DIR = '.claude/skills';

const exists = (filePath: string) => stat(filePath).then(() => true, () => false);

/**
 * Copies each skill of `skillsFolder` (a folder that contains a SKILL.md) into `.agents/skills/`
 * and links it from `.claude/skills/`. A skill the template already brings is left as is.
 * A missing skills folder does not block the creation: the project is shipped without.
 * Returns the names of the added skills.
 */
export async function addPoSkills(copy: string, skillsFolder: string | null): Promise<string[]> {
  if (!skillsFolder || !(await exists(skillsFolder))) return [];
  const added: string[] = [];
  for (const name of (await readdir(skillsFolder)).sort()) {
    const source = join(skillsFolder, name);
    if (!(await exists(join(source, 'SKILL.md')))) continue;
    const target = join(copy, COMMON_DIR, name);
    if (await exists(target)) continue;
    await cp(source, target, { recursive: true, filter: (filePath) => !filePath.endsWith('.DS_Store') });
    await mkdir(join(copy, CLAUDE_DIR), { recursive: true });
    await symlink(`../../${COMMON_DIR}/${name}`, join(copy, CLAUDE_DIR, name));
    added.push(name);
  }
  return added;
}
