import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Octokit } from '@octokit/rest';
import { readAdaConfig, type AdaConfig } from '../ada/ada-config.js';
import type { CreationFolders } from './repository-creation.js';

/**
 * Adoption of an existing project (#37, ADR-0010): rules and GitHub writes shared by
 * AdoptionService (the PO's request) and the assistant (which opens the PR at the end of its analysis).
 */

/** Topic set by an adoption (#37): the project enters ADA when its adoption PR is merged. */
export const ADOPTION_TOPIC = 'ada-reprise';

/** Branch and title of the adoption PR (Conventional Commits: `chore`, without a new version). */
export const ADOPTION_BRANCH = 'ada/reprise';
export const ADOPTION_TITLE = 'chore: reprise du projet par ADA';
/**
 * Required checks: those the adoption adds (PR title, file size). The project's CI
 * stays its own. A file already too long is tolerated as long as it does not grow.
 */
export const TITLE_CHECK = 'Titre de PR (Conventional Commits, semver)';
export const SIZE_CHECK = 'Taille des fichiers (une responsabilité par fichier)';
/** Template used when no stack is given; the common files come from the base (`catalogue/socle/`). */
export const REFERENCE_MODEL = 'vue-node';

/**
 * Files ADA brings to an adopted project, if they are not there already: story and bug
 * forms, check of the PR title and of the file size, versions by release-please. `ada.json` is always
 * proposed (it describes the preview); nothing else is touched.
 */
export const ADOPTION_FILES = [
  '.github/ISSUE_TEMPLATE/user-story.yml',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/workflows/titre-pr.yml',
  '.github/workflows/taille-fichiers.yml',
  '.github/workflows/release-please.yml',
  'release-please-config.json',
  '.release-please-manifest.json',
  'version.txt',
];

const status = (e: unknown) => (e as { status?: number }).status;

/**
 * Project without a screen (script, data processing…): the preview simply serves the project
 * files (README, results), so that the project still enters ADA. python3 is present
 * in ADA's preview images (node:24-bookworm as well as python:3.13-slim).
 */
export const PREVIEW_WITHOUT_SCREEN = { main: 'cd /app && python3 -m http.server 8000 --bind 0.0.0.0', port: 8000 } as const;

/**
 * Preview without a command to serve a page: the one of a project without a screen. A command without a port
 * stays as is (the port cannot be guessed): validation will refuse it, a developer decides.
 */
function completePreview(preview: unknown): Record<string, unknown> {
  const current = preview && typeof preview === 'object' && !Array.isArray(preview) ? (preview as Record<string, unknown>) : {};
  const withoutCommand = typeof current.main !== 'string' || !current.main.trim();
  return withoutCommand ? { ...current, ...PREVIEW_WITHOUT_SCREEN } : current;
}

/**
 * ada.json of an adopted project, from the one the analysis proposes (or from the chosen template):
 * no file to customize, only the checks added by the adoption required, no chart, and
 * the appearance chosen by the PO. Throws if the description of the preview is invalid.
 */
export function adoptionAdaJson(raw: unknown, dsfr = false): string {
  const base = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  if (!base || typeof base !== 'object' || Array.isArray(base)) throw new Error('ada.json absent');
  const parsed = base as Record<string, unknown>;
  const ada = { ...parsed, preview: completePreview(parsed.preview), customize: [], requiredChecks: [TITLE_CHECK, SIZE_CHECK], deployment: null, dsfr };
  const valid: AdaConfig = readAdaConfig(JSON.stringify(ada));
  return `${JSON.stringify({ ...ada, preview: valid.preview, type: valid.type, checks: valid.checks }, null, 2)}\n`;
}

export function adoptionBody(options: { stack: string | null; files: string[]; login: string; dsfr: boolean; analysis: string | null }): string {
  return [
    `Reprise du projet par ADA, demandée par @${options.login}.`,
    options.stack ? `Stack la plus proche indiquée : **${options.stack}**.` : 'Aperçu décrit par l’analyse du projet.',
    options.dsfr ? 'Apparence : **DSFR** (Système de design de l’État).' : 'Apparence : **celle du projet**, ADA n’introduit pas le DSFR.',
    ...(options.analysis ? ['', `Analyse et améliorations proposées : ${options.analysis}`] : []),
    '',
    'Fichiers ajoutés (ceux déjà présents ne sont pas modifiés) :',
    ...options.files.map((file) => `- \`${file}\``),
    '',
    'Une fois cette PR fusionnée, le projet apparaît dans ADA : stories, aperçu et versions.',
    '',
    '`ada.json` décrit comment ADA démarre l’aperçu. Si l’aperçu ne démarre pas après la reprise, un développeur l’ajuste à la structure du projet.',
    '',
    '🤖 Proposée par ADA',
  ].join('\n');
}

export async function adoptionPullRequest(gh: Octokit, owner: string, repo: string): Promise<string | null> {
  const { data } = await gh.pulls.list({ owner, repo, head: `${owner}:${ADOPTION_BRANCH}`, state: 'open', per_page: 1 });
  return data[0]?.html_url ?? null;
}

async function exists(gh: Octokit, owner: string, repo: string, path: string): Promise<boolean> {
  try {
    await gh.repos.getContent({ owner, repo, path, ref: 'main' });
    return true;
  } catch (e) {
    if (status(e) === 404) return false;
    throw e;
  }
}

/** Common files missing from main (read in `templateFolder`), plus ada.json (always proposed). */
export async function filesToBring(gh: Octokit, owner: string, repo: string, folders: CreationFolders, adaJson: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const filePath of ADOPTION_FILES) {
    if (await exists(gh, owner, repo, filePath)) continue;
    // The template of the given stack wins (forms specific to an API…), otherwise the common base.
    const parsed = await readFile(join(folders.template, filePath), 'utf8').catch(() => (folders.base ? readFile(join(folders.base, filePath), 'utf8') : Promise.reject(new Error(`${filePath} introuvable`))));
    files.set(filePath, parsed);
  }
  files.set('ada.json', adaJson);
  return files;
}

/** One commit under the PO's name on `ada/reprise`, from main (branch recreated if it existed). */
async function pushBranch(gh: Octokit, owner: string, repo: string, files: Map<string, string>, login: string): Promise<void> {
  const { data: main } = await gh.git.getRef({ owner, repo, ref: 'heads/main' });
  const { data: mainCommit } = await gh.git.getCommit({ owner, repo, commit_sha: main.object.sha });
  const { data: tree } = await gh.git.createTree({
    owner,
    repo,
    base_tree: mainCommit.tree.sha,
    tree: [...files].map(([path, content]) => ({ path, mode: '100644' as const, type: 'blob' as const, content })),
  });
  const { data: commit } = await gh.git.createCommit({
    owner,
    repo,
    message: ADOPTION_TITLE,
    tree: tree.sha,
    parents: [main.object.sha],
    author: { name: login, email: `${login}@users.noreply.github.com` },
  });
  try {
    await gh.git.createRef({ owner, repo, ref: `refs/heads/${ADOPTION_BRANCH}`, sha: commit.sha });
  } catch (e) {
    if (status(e) !== 422) throw e; // the branch exists (interrupted adoption): it is replaced
    await gh.git.updateRef({ owner, repo, ref: `heads/${ADOPTION_BRANCH}`, sha: commit.sha, force: true });
  }
}

/** `ada/reprise` branch then PR to main; nothing reaches main without the PO's merge. */
export async function openAdoptionPullRequest(
  gh: Octokit,
  target: { owner: string; repo: string; login: string },
  files: Map<string, string>,
  body: string,
): Promise<string> {
  const { owner, repo, login } = target;
  const existing = await adoptionPullRequest(gh, owner, repo);
  if (existing) return existing;
  await pushBranch(gh, owner, repo, files, login);
  const { data: pr } = await gh.pulls.create({ owner, repo, head: ADOPTION_BRANCH, base: 'main', title: ADOPTION_TITLE, body: body });
  return pr.html_url;
}
