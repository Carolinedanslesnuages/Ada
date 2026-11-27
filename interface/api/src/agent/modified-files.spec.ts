import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reservedPaths } from './tools.js';
import { modifiedFiles } from './modified-files.js';

/** Real git repository (not a simulated output): it is git's behaviour that is at stake. */
describe('Files modified by a branch (safeguard of the reserved folders)', () => {
  const folders: string[] = [];
  afterEach(() => folders.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', cwd, ...args], { encoding: 'utf8' });
  const run = async (command: string, args: string[]) => ({ stdout: execFileSync(command, args, { encoding: 'utf8' }) });

  function repository(): string {
    const cwd = mkdtempSync(join(tmpdir(), 'garde-fou-'));
    folders.push(cwd);
    git(cwd, 'init', '-q', '-b', 'main');
    mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(cwd, '.github', 'workflows', 'ci.yml'), 'name: ci\non: pull_request\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n');
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-qm', 'init');
    git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(cwd, 'checkout', '-q', '-b', 'story/1');
    return cwd;
  }

  it('sees the CI as deleted when it is moved out of .github/ (git mv)', async () => {
    const cwd = repository();
    mkdirSync(join(cwd, 'docs'));
    git(cwd, 'mv', '.github/workflows/ci.yml', 'docs/ci.yml');
    git(cwd, 'commit', '-qm', 'feat: x');
    const files = await modifiedFiles(run, cwd, 'story/1');
    expect(files).toContain('.github/workflows/ci.yml');
    expect(reservedPaths(files)).toEqual(['.github/workflows/ci.yml']);
  });

  it('reports nothing for an ordinary modification', async () => {
    const cwd = repository();
    writeFileSync(join(cwd, 'page.txt'), 'bonjour');
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-qm', 'feat: page');
    expect(reservedPaths(await modifiedFiles(run, cwd, 'story/1'))).toEqual([]);
  });
});
