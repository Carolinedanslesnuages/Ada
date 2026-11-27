import type { Runner } from '../preview/preview.service.js';

/**
 * Files touched by the branch since main, former paths of moved files included:
 * without `--no-renames`, `git mv .github/workflows/ci.yml docs/ci.yml` would only show `docs/ci.yml`
 * and the safeguard of the reserved folders would not see that the CI is gone.
 */
export async function modifiedFiles(run: Runner, cwd: string, branch: string): Promise<string[]> {
  const { stdout } = await run('git', ['-C', cwd, 'diff', '--name-only', '--no-renames', `origin/main...${branch}`]);
  return stdout.split('\n').filter(Boolean);
}
