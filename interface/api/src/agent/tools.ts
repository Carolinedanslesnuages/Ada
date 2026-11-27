/** What the agent is allowed to do, and what stays forbidden whatever the phase. */
import type { Phase } from './agent.js';

/** Command run in the preview container (from the cloned repository), as an unprivileged user (1000: “node” or “ada” depending on the image). */
export const IN_CONTAINER = 'docker compose -f ../compose.yml exec -T -u 1000 app bash -lc';

/**
 * Tools allowed per phase, limited to the project (current directory): the agent can neither read
 * nor write elsewhere on the machine. Only the skills folders are readable in addition (real
 * paths, “//” prefix = absolute path). No push, no command outside the container.
 */
export function allowedTools(phase: Phase, readableFolders: string[] = []): string[] {
  const reading = ['Read(./**)', 'Glob(./**)', 'Grep(./**)', ...readableFolders.map((folder) => `Read(/${folder}/**)`)];
  if (phase === 'analysis' || phase === 'adoption') return ['Skill', ...reading];
  return [
    'Skill',
    ...reading,
    'Edit(./**)',
    'Write(./**)',
    `Bash(${IN_CONTAINER} *)`,
    // Exact forms (without a “*” glued to the word): “git diff*” would also accept “git difftool”.
    'Bash(git status)',
    'Bash(git status *)',
    'Bash(git diff)',
    'Bash(git diff *)',
    'Bash(git add *)',
    // Deleting or renaming a project file (a removed page, for example): git refuses any
    // path outside the repository; .github/, helm/ and charts/ stay protected by reservedPaths before the push.
    'Bash(git rm *)',
    'Bash(git mv *)',
    'Bash(git commit *)',
    'Bash(git log)',
    'Bash(git log *)',
  ];
}

/**
 * Forbidden, whatever the phase: what is reserved for developers (the CI and the versions
 * in .github, the deployment in helm, or charts for projects created earlier) and the agent's own settings. A denial
 * wins over a permission.
 */
export const FORBIDDEN_TOOLS = [
  'Edit(./.github/**)',
  'Write(./.github/**)',
  'Edit(./helm/**)',
  'Write(./helm/**)',
  'Edit(./charts/**)',
  'Write(./charts/**)',
  // Settings and tools of the agent: never modifiable by it (ADA's skills are linked there).
  'Edit(./.claude/**)',
  'Write(./.claude/**)',
  'Edit(./.agents/**)',
  'Write(./.agents/**)',
  'Edit(./.mcp.json)',
  'Write(./.mcp.json)',
  // git can read or write outside the project through these options: “diff --no-index” compares any two
  // files of the machine, “--output” writes anywhere, “commit -F” takes any file
  // as the message (which then goes to GitHub).
  'Bash(git diff --no-index*)',
  'Bash(git diff*--output*)',
  'Bash(git log*--output*)',
  'Bash(git commit*--file*)',
  'Bash(git commit* -F*)',
  'Bash(git commit*--template*)',
];

/**
 * Agent isolation: it reads only the settings of the server user, never those of the
 * PO's repository (`.claude/settings.json` of an adopted project: hooks, widened permissions), and
 * loads no MCP server coming from the repository (`.mcp.json`).
 */
export const ISOLATION_OPTIONS = ['--setting-sources', 'user', '--strict-mcp-config'];

/**
 * Reserved paths: the CI, the versions and the deployment (reserved for developers), and the
 * agent's own settings (skills, permissions, MCP servers). The tool restrictions only
 * cover direct editing; from the container, the agent writes wherever it wants in the mounted
 * repository: an instruction file slipped into a PR would act on every following request.
 */
const RESERVED_FOLDERS = ['.github/', 'helm/', 'charts/', '.claude/', '.agents/', '.mcp.json'];

/** Files modified, added or deleted in a reserved path: the branch must not be pushed. */
export function reservedPaths(files: string[]): string[] {
  return files.filter((file) => RESERVED_FOLDERS.some((folder) => file.trim().startsWith(folder)));
}

/** A skill that pre-authorizes tools or runs commands when loaded would break this isolation. */
export function isSafeSkill(skillContent: string): boolean {
  const header = skillContent.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return !/^allowed-tools:/m.test(header) && !/!`/.test(skillContent);
}
