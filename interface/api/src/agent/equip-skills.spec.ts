import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { readConfig } from '../config.js';
import { equipSkills } from './equip-skills.js';

describe('Skills linked to the agent\'s project', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agent-'));
  });

  it('equips with its skills a project whose git folder is stored outside the repository (.git reduced to a file), leaving nothing to commit', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } = await import('node:fs');
    const { isolateGit } = await import('../preview/isolated-git.js');
    const { defaultRun } = await import('../preview/preview.service.js');
    const catalog = join(root, 'catalogue');
    mkdirSync(join(catalog, 'dsfr-skill'), { recursive: true });
    writeFileSync(join(catalog, 'dsfr-skill', 'SKILL.md'), '---\nname: dsfr-skill\n---\n');
    // A real preview repository, migrated: <project>/git is the git folder, <project>/depot/.git a plain file.
    const repository = join(root, 'gladys', 'depot');
    mkdirSync(repository, { recursive: true });
    const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
    execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main'], { env });
    writeFileSync(join(repository, 'a.txt'), 'a');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', repository, 'add', '-A'], { env });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', repository, 'commit', '-qm', 'init'], { env });
    await isolateGit(repository);
    expect(statSync(join(repository, '.git')).isFile()).toBe(true);
    const skills = readConfig({ GITHUB_OWNER: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32), AGENT_COMMAND: '/bin/agent', AGENT_SKILLS: join(catalog, 'dsfr-skill') }).AGENT_SKILLS;
    const team = { equipSkills: (cwd: string) => equipSkills(cwd, skills, () => undefined) };
    expect((await team.equipSkills(repository)).names).toEqual(['dsfr-skill']);
    expect(existsSync(join(repository, '.claude', 'skills', 'dsfr-skill'))).toBe(true);
    // The exclusions go into the real git folder, and git does not see the linked skills.
    expect(readFileSync(join(root, 'gladys', 'git', 'info', 'exclude'), 'utf8')).toContain('/.claude/skills/');
    const { stdout } = await defaultRun('git', ['-C', repository, 'status', '--porcelain'], { env });
    expect(stdout).toBe('');
  });

  describe('skills brought by the repository itself (adopted project, files added in a PR)', () => {
    const prepare = async (repositorySkill: { name: string; content: string }) => {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const catalog = join(root, 'catalogue');
      mkdirSync(join(catalog, 'dsfr-skill'), { recursive: true });
      writeFileSync(join(catalog, 'dsfr-skill', 'SKILL.md'), '---\nname: dsfr-skill\n---\n');
      const project = join(root, 'projet');
      mkdirSync(join(project, '.git', 'info'), { recursive: true });
      mkdirSync(join(project, '.claude', 'skills', repositorySkill.name), { recursive: true });
      writeFileSync(join(project, '.claude', 'skills', repositorySkill.name, 'SKILL.md'), repositorySkill.content);
      const warnings: string[] = [];
      return { project, skills: [join(catalog, 'dsfr-skill')], warnings, warnUser: (message: string) => warnings.push(message) };
    };

    it('refuses to work with a repository skill that pre-authorizes tools or runs commands', async () => {
      const { project, skills, warnUser } = await prepare({ name: 'deploiement', content: '---\nname: deploiement\nallowed-tools: Bash(*)\n---\nDéploie.' });
      await expect(equipSkills(project, skills, warnUser)).rejects.toThrow(/skill « deploiement » qui pré-autorise des outils ou exécute des commandes/);
    });

    it('does not link an ADA skill that a repository folder of the same name would replace, and does not mention it to the agent', async () => {
      const { lstatSync } = await import('node:fs');
      const { project, skills, warnings, warnUser } = await prepare({ name: 'dsfr-skill', content: '---\nname: dsfr-skill\n---\nMa version.' });
      expect(await equipSkills(project, skills, warnUser)).toEqual({ names: [], folders: [] });
      expect(lstatSync(join(project, '.claude', 'skills', 'dsfr-skill')).isDirectory()).toBe(true);
      expect(warnings.join('\n')).toMatch(/ADA skill dsfr-skill shadowed/);
    });

    it('leaves a safe repository skill, under another name, next to ADA\'s', async () => {
      const { project, skills, warnUser } = await prepare({ name: 'metier', content: '---\nname: metier\n---\nRègles métier.' });
      expect((await equipSkills(project, skills, warnUser)).names).toEqual(['dsfr-skill']);
    });
  });

  it('equips the project with the configured skills, leaving nothing to commit', async () => {
    const { mkdirSync, writeFileSync, readFileSync, lstatSync, readlinkSync, realpathSync, existsSync } = await import('node:fs');
    const catalog = join(root, 'catalogue');
    for (const name of ['dsfr-skill', 'repo-perimetre']) {
      mkdirSync(join(catalog, name), { recursive: true });
      writeFileSync(join(catalog, name, 'SKILL.md'), `---\nname: ${name}\n---\n`);
    }
    const project = join(root, 'projet');
    mkdirSync(join(project, '.git', 'info'), { recursive: true });
    writeFileSync(join(project, '.git', 'info', 'exclude'), '# exclusions locales\n');
    const skills = readConfig({ GITHUB_OWNER: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32), AGENT_COMMAND: '/bin/agent', AGENT_SKILLS: `${join(catalog, 'dsfr-skill')}, ${join(catalog, 'repo-perimetre')}, ${join(catalog, 'absente')}, ${join(catalog, 'adr-new')}` }).AGENT_SKILLS;
    const team = { equipSkills: (cwd: string) => equipSkills(cwd, skills, () => undefined) };
    mkdirSync(join(catalog, 'adr-new'), { recursive: true });
    writeFileSync(join(catalog, 'adr-new', 'SKILL.md'), '---\nname: adr-new\nallowed-tools: Read Write\n---\n');
    const expected = { names: ['dsfr-skill', 'repo-perimetre'], folders: [realpathSync(join(catalog, 'dsfr-skill')), realpathSync(join(catalog, 'repo-perimetre'))] };
    expect(await team.equipSkills(project)).toEqual(expected);
    expect(await team.equipSkills(project)).toEqual(expected);
    expect(existsSync(join(project, '.claude/skills/adr-new'))).toBe(false);
    for (const skillsRoot of ['.claude/skills', '.agents/skills']) {
      const link = join(project, skillsRoot, 'dsfr-skill');
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readlinkSync(link)).toBe(join(catalog, 'dsfr-skill'));
    }
    const exclusions = readFileSync(join(project, '.git', 'info', 'exclude'), 'utf8');
    expect(exclusions.match(/^\/\.claude\/skills\/$/gm)).toHaveLength(1);
    expect(exclusions).toContain('/.agents/skills/');
  });
});
