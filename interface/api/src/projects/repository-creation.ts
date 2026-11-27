/** Steps of a project creation on GitHub: empty repository, copy of the template pushed, starting idea. */
import { ForbiddenException } from '@nestjs/common';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Octokit } from '@octokit/rest';
import type { Runner } from '../preview/preview.service.js';
import { describeGithubError } from '../github/errors.js';
import { formatPrompt, FREE_LABEL, LAUNCH_MARKER, STATUSES, promptTitle } from '../stories/story.js';
import { customize, type ProjectValues } from './project.js';
import { addPoSkills } from './project-skills.js';
import type { GithubRepository } from './projects.service.js';

const status = (e: unknown) => (e as { status?: number }).status;

/**
 * The idea told at creation becomes the first free request of the project, launched at once (#68):
 * the assistant asks its questions then proposes the objective and the first stories (breakdown),
 * which the PO approves. A failure here does not undo the creation: the PO can “Prompt” the idea.
 */
export async function saveIdea(gh: Octokit, owner: string, repo: string, idea: string, login: string, warnUser: (message: string) => void): Promise<number | null> {
  try {
    const { data } = await gh.issues.create({
      owner,
      repo,
      title: promptTitle(idea),
      body: formatPrompt(idea),
      labels: [FREE_LABEL, STATUSES['in-progress']],
    });
    await gh.issues.createComment({ owner, repo, issue_number: data.number, body: `${LAUNCH_MARKER} par ${login} (idée de départ du projet).` });
    return data.number;
  } catch (e) {
    warnUser(`Starting idea not saved in ${owner}/${repo}: ${describeGithubError(e)}`);
    return null;
  }
}

/** Empty repository on the signed-in person's account, private or public as they choose. */
export async function createEmptyRepository(gh: Octokit, slug: string, description: string, isPrivate: boolean, warnUser: (message: string) => void): Promise<GithubRepository> {
  const parameters = { name: slug, description, private: isPrivate, auto_init: false };
  try {
    const { data } = await gh.repos.createForAuthenticatedUser(parameters);
    return data;
  } catch (e) {
    if (status(e) === 404 || status(e) === 403) {
      warnUser(`Repository creation refused: ${describeGithubError(e)}`);
      throw new ForbiddenException(
        'L’application GitHub d’ADA ne peut pas créer de dépôt sur votre compte. ' +
          'Installez-la sur votre compte GitHub (page de l’application → Install → votre compte → « All repositories »), ' +
          'ou, si elle l’est déjà, acceptez les permissions demandées s’il y a une demande en attente.',
      );
    }
    throw e;
  }
}

/** Files of a catalog folder tracked by git: neither node_modules nor local secrets. */
async function trackedFiles(run: Runner, folder: string): Promise<string[]> {
  const { stdout } = await run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'], { cwd: folder });
  return stdout.split('\0').filter(Boolean);
}

/**
 * Files to copy, path in the project → source file: the common base first
 * (`catalogue/socle/`, if it exists), then the template, which replaces it file by file.
 */
export async function projectFiles(run: Runner, folders: CreationFolders, excluded: string[]): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for (const folder of [folders.base, folders.template]) {
    if (!folder || !(await exists(folder))) continue;
    for (const file of await trackedFiles(run, folder)) sources.set(file, join(folder, file));
  }
  const isExcluded = (file: string) => excluded.some((folder) => file === folder || file.startsWith(`${folder.replace(/\/$/, '')}/`));
  for (const file of sources.keys()) if (isExcluded(file)) sources.delete(file);
  return sources;
}

const exists = (filePath: string) => access(filePath).then(() => true, () => false);

/** Folders copied at creation: the common base (optional) and the chosen template. */
export interface CreationFolders {
  base: string | null;
  template: string;
}

/**
 * Copy of the common base then of the template (see `projectFiles`), markers replaced, ADA's
 * `po-` skills added, a single commit under the PO's name. Without a difference (creation interrupted
 * then replayed), nothing is pushed.
 */
export async function pushTemplate(
  tools: { run: Runner; env: NodeJS.ProcessEnv; url: string },
  login: string,
  folders: CreationFolders,
  toCustomize: string[],
  excluded: string[],
  values: ProjectValues,
  skillsFolder: string | null = null,
): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), 'ada-creation-'));
  const copy = join(work, 'repository');
  const { run, env } = tools;
  const git = (...args: string[]) => run('git', ['-C', copy, ...args], { env });
  try {
    await run('git', ['clone', '--quiet', tools.url, copy], { env });
    await git('symbolic-ref', 'HEAD', 'refs/heads/main');
    await git('rm', '-r', '-q', '--ignore-unmatch', '--', '.');
    const files = await projectFiles(run, folders, excluded);
    if (files.get('ada.json') !== join(folders.template, 'ada.json')) throw new Error(`Modèle incomplet : ${folders.template}`);
    for (const [file, source] of files) {
      const target = join(copy, file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
      if (toCustomize.includes(file)) {
        await writeFile(target, customize(await readFile(target, 'utf8'), values));
      }
    }
    await addPoSkills(copy, skillsFolder);
    await git('add', '-A');
    const { stdout: changes } = await git('status', '--porcelain');
    if (!changes.trim()) return;
    await git(
      '-c', `user.name=${login}`,
      '-c', `user.email=${login}@users.noreply.github.com`,
      'commit', '--quiet', '-m', `chore: création du projet ${values.name}`,
    );
    await git('push', '--quiet', 'origin', 'main');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
