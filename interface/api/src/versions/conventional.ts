/**
 * Conventional Commits 1.0.0: `type(scope)!: description`. On main, each commit comes from the
 * title of a PR (squash merge) and decides the next version (semver, through release-please):
 * `fix` → patch (0.0.x), `feat` → feature (0.x.0), `!` or `BREAKING CHANGE` →
 * breaking change (x.0.0; before 1.0.0, 0.x.0). The other types create no version.
 * Same rule as the “Titre de PR” check of the CI (catalogue/socle/.github/workflows/titre-pr.yml, Constance action).
 */
export const CONVENTIONAL_TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'style', 'revert'] as const;

const PATTERN = new RegExp(`^(${CONVENTIONAL_TYPES.join('|')})(\\([^()\\s][^()]*\\))?!?: \\S`);

export function isConventionalTitle(title: string): boolean {
  return PATTERN.test(title);
}
