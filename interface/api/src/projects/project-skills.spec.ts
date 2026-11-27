import { describe, expect, it } from 'vitest';
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addPoSkills } from './project-skills.js';

async function withFolders(body: (adaSkills: string, project: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'ada-skills-'));
  const adaSkills = join(root, 'skills-po');
  const project = join(root, 'projet');
  await mkdir(adaSkills, { recursive: true });
  await mkdir(project, { recursive: true });
  try {
    await body(adaSkills, project);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function write(filePath: string, content: string) {
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, content);
}

describe('po- skills shipped in a created project', () => {
  it('copies each skill with its references into .agents/skills and links it from .claude/skills', async () => {
    await withFolders(async (adaSkills, project) => {
      await write(join(adaSkills, 'po-story', 'SKILL.md'), '---\nname: po-story\n---\n');
      await write(join(adaSkills, 'po-story', 'references', 'rgaa.md'), 'grille');
      await write(join(adaSkills, 'po-bug', 'SKILL.md'), '---\nname: po-bug\n---\n');

      expect(await addPoSkills(project, adaSkills)).toEqual(['po-bug', 'po-story']);

      expect(await readFile(join(project, '.agents/skills/po-story/references/rgaa.md'), 'utf8')).toBe('grille');
      const link = join(project, '.claude/skills/po-story');
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(await readlink(link)).toBe('../../.agents/skills/po-story');
      expect(await readFile(join(link, 'SKILL.md'), 'utf8')).toContain('po-story');
    });
  });

  it('ignores what is not a skill (index.json catalog, folder without SKILL.md)', async () => {
    await withFolders(async (adaSkills, project) => {
      await write(join(adaSkills, 'index.json'), '[]');
      await write(join(adaSkills, 'brouillon', 'notes.md'), 'rien');
      await write(join(adaSkills, 'po-bug', 'SKILL.md'), 'ok');

      expect(await addPoSkills(project, adaSkills)).toEqual(['po-bug']);
      await expect(lstat(join(project, '.agents/skills/brouillon'))).rejects.toThrow();
      await expect(lstat(join(project, '.agents/skills/index.json'))).rejects.toThrow();
    });
  });

  it('leaves as is a skill that the template already brings', async () => {
    await withFolders(async (adaSkills, project) => {
      await write(join(adaSkills, 'po-bug', 'SKILL.md'), 'version d’ADA');
      await write(join(project, '.agents/skills/po-bug/SKILL.md'), 'version du modèle');

      expect(await addPoSkills(project, adaSkills)).toEqual([]);
      expect(await readFile(join(project, '.agents/skills/po-bug/SKILL.md'), 'utf8')).toBe('version du modèle');
    });
  });

  it('does not block the creation when the skills folder is missing or not configured', async () => {
    await withFolders(async (adaSkills, project) => {
      expect(await addPoSkills(project, join(adaSkills, 'inexistant'))).toEqual([]);
      expect(await addPoSkills(project, null)).toEqual([]);
    });
  });
});
