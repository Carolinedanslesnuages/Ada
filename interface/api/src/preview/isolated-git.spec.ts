import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultRun } from './preview.service.js';
import { gitFolderOf, agentEnvironment, isolatedGitEnvironment, isolateGit } from './isolated-git.js';

/**
 * Real git: the repository of a preview is mounted in a container where the agent runs free commands.
 * A hook set in its .git must never run on the server.
 */
describe('Git isolation (repository mounted in the preview container)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

  const CLEAN_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', cwd, ...args], { encoding: 'utf8', env: CLEAN_ENV });
  const log = (project: string) => execFileSync('git', ['--git-dir', join(project, 'git'), 'log', '--oneline'], { encoding: 'utf8', env: CLEAN_ENV });

  /** Old-style preview project: `<project>/depot/.git` is a folder, hence visible from the container. */
  function oldProject(): { project: string; repository: string; trap: string } {
    const project = mkdtempSync(join(tmpdir(), 'isole-'));
    roots.push(project);
    const repository = join(project, 'depot');
    mkdirSync(repository);
    git(repository, 'init', '-q', '-b', 'main');
    writeFileSync(join(repository, 'a.txt'), 'a');
    git(repository, 'add', '-A');
    git(repository, 'commit', '-qm', 'init');
    // What a command run in the container can write: a hook that leaves a trace on the host.
    const trap = join(project, 'HOOK-EXECUTE-SUR-LE-SERVEUR');
    const hook = join(repository, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, `#!/bin/sh\ntouch "${trap}"\n`);
    chmodSync(hook, 0o755);
    return { project, repository, trap };
  }

  /** A commit as the API or the agent make them: through the default runner, with the isolation applied. */
  async function newCommit(repository: string, name: string): Promise<void> {
    writeFileSync(join(repository, name), name);
    await defaultRun('git', ['-C', repository, 'add', '-A'], { env: CLEAN_ENV });
    await defaultRun('git', ['-C', repository, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', name], { env: CLEAN_ENV });
  }

  it('control: without isolation, the hook set in the repository does run', () => {
    const { repository, trap } = oldProject();
    writeFileSync(join(repository, 'b.txt'), 'b');
    git(repository, 'add', '-A');
    git(repository, 'commit', '-qm', 'b');
    expect(existsSync(trap)).toBe(true);
  });

  it('stores the .git outside the mounted folder and removes the hooks already set', async () => {
    const { project, repository, trap } = oldProject();
    await isolateGit(repository);
    expect(statSync(join(repository, '.git')).isFile()).toBe(true);
    expect(existsSync(join(project, 'git', 'hooks', 'pre-commit'))).toBe(false);
    await newCommit(repository, 'c.txt');
    expect(existsSync(trap)).toBe(false);
    expect(log(project)).toContain('c.txt');
  });

  it('ignores a .git rewritten from the container to point to a booby-trapped git folder', async () => {
    const { project, repository, trap } = oldProject();
    await isolateGit(repository);
    // The container sees the repository: it builds a booby-trapped git folder in the repository and points the .git file to it.
    const fake = join(repository, 'faux-git');
    mkdirSync(join(fake, 'hooks'), { recursive: true });
    mkdirSync(join(fake, 'objects'));
    mkdirSync(join(fake, 'refs'));
    writeFileSync(join(fake, 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(fake, 'hooks', 'pre-commit'), `#!/bin/sh\ntouch "${trap}"\n`);
    chmodSync(join(fake, 'hooks', 'pre-commit'), 0o755);
    writeFileSync(join(fake, 'config'), `[core]\n\trepositoryformatversion = 0\n\thooksPath = ${join(fake, 'hooks')}\n`);
    writeFileSync(join(repository, '.git'), 'gitdir: ./faux-git\n');
    await newCommit(repository, 'd.txt');
    expect(existsSync(trap)).toBe(false);
    expect(log(project)).toContain('d.txt');
  });

  it('turns off the file monitor even if it is set in the git folder, without overwriting the token already passed', async () => {
    const { project, repository } = oldProject();
    await isolateGit(repository);
    const env = isolatedGitEnvironment({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraheader', GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic xx' }, repository);
    expect(env).toMatchObject({
      GIT_DIR: join(project, 'git'),
      GIT_WORK_TREE: repository,
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'http.extraheader',
      GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic xx',
      GIT_CONFIG_KEY_1: 'core.hooksPath',
      GIT_CONFIG_VALUE_1: '/dev/null',
      GIT_CONFIG_KEY_2: 'core.fsmonitor',
      GIT_CONFIG_VALUE_2: 'false',
    });
    // fsmonitor booby-trapped in the git folder: it would run at every “git status”.
    const trap = join(project, 'FSMONITOR-EXECUTE');
    const monitor = join(project, 'moniteur.sh');
    writeFileSync(monitor, `#!/bin/sh\ntouch "${trap}"\n`);
    chmodSync(monitor, 0o755);
    writeFileSync(join(project, 'git', 'config'), `${readFileSync(join(project, 'git', 'config'), 'utf8')}[core]\n\tfsmonitor = ${monitor}\n`);
    await defaultRun('git', ['-C', repository, 'status', '--porcelain'], { env: CLEAN_ENV });
    expect(existsSync(trap)).toBe(false);
  });

  it('changes nothing for a folder that is not a preview repository (e.g. temporary creation copy)', () => {
    const env = { PATH: '/bin' };
    expect(gitFolderOf('/tmp/ada-creation-x/copie')).toBeNull();
    expect(isolatedGitEnvironment(env, '/tmp/ada-creation-x/copie')).toBe(env);
    expect(isolatedGitEnvironment(env, join(tmpdir(), 'absent-xyz', 'depot'))).toBe(env);
  });

  it('removes the server secrets from the agent\'s environment, and keeps the rest', () => {
    const env = agentEnvironment(
      { PATH: '/bin', HOME: '/h', SESSION_SECRET: 's', GITHUB_CLIENT_SECRET: 'c', GITHUB_CLIENT_ID: 'i', OBSERVE_APP_SECRET: 'o', ANTHROPIC_API_KEY: 'k' },
      '/ailleurs/depot',
    );
    expect(Object.keys(env).sort()).toEqual(['ANTHROPIC_API_KEY', 'HOME', 'PATH']);
  });
});
