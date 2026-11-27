import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { DEFAULT_ADA } from '../ada/ada-config.js';
import { adoptionAdaJson, PREVIEW_WITHOUT_SCREEN, ADOPTION_BRANCH, adoptionBody, filesToBring, ADOPTION_FILES, openAdoptionPullRequest, ADOPTION_TITLE } from './adoption.js';

const catalog = mkdtempSync(join(tmpdir(), 'ada-test-reprise-'));
const write = (filePath: string, content: string) => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
};
// The base carries the common files; the template replaces only one (form specific to an API).
const folders = { base: join(catalog, 'socle'), template: join(catalog, 'api-nest') };
for (const file of ADOPTION_FILES) write(join(folders.base, file), `socle : ${file}`);
write(join(folders.template, '.github/ISSUE_TEMPLATE/user-story.yml'), 'modèle : story d’API');
afterAll(() => rmSync(catalog, { recursive: true, force: true }));
const missing = () => Object.assign(new Error('absent'), { status: 404 });

describe('adoption: rules and GitHub writes (#37)', () => {
  const gh = {
    repos: { getContent: vi.fn() },
    pulls: { list: vi.fn(), create: vi.fn() },
    git: { getRef: vi.fn(), getCommit: vi.fn(), createTree: vi.fn(), createCommit: vi.fn(), createRef: vi.fn(), updateRef: vi.fn() },
  };
  const octokit = gh as unknown as Octokit;

  beforeEach(() => {
    vi.clearAllMocks();
    gh.repos.getContent.mockRejectedValue(missing());
    gh.pulls.list.mockResolvedValue({ data: [] });
    gh.pulls.create.mockResolvedValue({ data: { html_url: 'https://github.com/un-po/mon-poc/pull/3' } });
    gh.git.getRef.mockResolvedValue({ data: { object: { sha: 'sha-main' } } });
    gh.git.getCommit.mockResolvedValue({ data: { tree: { sha: 'arbre-main' } } });
    gh.git.createTree.mockResolvedValue({ data: { sha: 'arbre' } });
    gh.git.createCommit.mockResolvedValue({ data: { sha: 'commit' } });
    gh.git.createRef.mockResolvedValue({});
  });

  it('brings only the missing files, plus ada.json', async () => {
    gh.repos.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '.github/ISSUE_TEMPLATE/bug.yml') return { data: {} };
      throw missing();
    });
    const files = await filesToBring(octokit, 'un-po', 'mon-poc', folders, '{}');
    expect([...files.keys()]).not.toContain('.github/ISSUE_TEMPLATE/bug.yml');
    expect([...files.keys()]).toEqual(expect.arrayContaining(['.github/ISSUE_TEMPLATE/user-story.yml', '.github/workflows/titre-pr.yml', '.github/workflows/taille-fichiers.yml', 'ada.json']));
    expect(files.get('.github/ISSUE_TEMPLATE/user-story.yml')).toBe('modèle : story d’API');
    expect(files.get('.github/workflows/titre-pr.yml')).toBe('socle : .github/workflows/titre-pr.yml');
  });

  it('one commit under the PO\'s name on ada/reprise, then a PR to main, without touching main', async () => {
    const url = await openAdoptionPullRequest(octokit, { owner: 'un-po', repo: 'mon-poc', login: 'un-po' }, new Map([['ada.json', '{}']]), 'corps');
    expect(url).toBe('https://github.com/un-po/mon-poc/pull/3');
    expect(gh.git.createTree).toHaveBeenCalledWith(expect.objectContaining({ base_tree: 'arbre-main' }));
    expect(gh.git.createCommit).toHaveBeenCalledWith(expect.objectContaining({ parents: ['sha-main'], author: { name: 'un-po', email: 'un-po@users.noreply.github.com' } }));
    expect(gh.git.createRef).toHaveBeenCalledWith(expect.objectContaining({ ref: `refs/heads/${ADOPTION_BRANCH}`, sha: 'commit' }));
    expect(gh.git.updateRef).not.toHaveBeenCalled();
    expect(gh.pulls.create).toHaveBeenCalledWith(expect.objectContaining({ head: ADOPTION_BRANCH, base: 'main', title: ADOPTION_TITLE }));
  });

  it('replaces the branch of an interrupted adoption; an already open PR is returned as is', async () => {
    gh.git.createRef.mockRejectedValue(Object.assign(new Error('existe'), { status: 422 }));
    await openAdoptionPullRequest(octokit, { owner: 'un-po', repo: 'mon-poc', login: 'un-po' }, new Map(), 'corps');
    expect(gh.git.updateRef).toHaveBeenCalledWith(expect.objectContaining({ ref: `heads/${ADOPTION_BRANCH}`, force: true }));

    vi.clearAllMocks();
    gh.pulls.list.mockResolvedValue({ data: [{ html_url: 'https://github.com/un-po/mon-poc/pull/1' }] });
    expect(await openAdoptionPullRequest(octokit, { owner: 'un-po', repo: 'mon-poc', login: 'un-po' }, new Map(), 'corps')).toBe('https://github.com/un-po/mon-poc/pull/1');
    expect(gh.git.createCommit).not.toHaveBeenCalled();
  });

  it('adopted ada.json: proposed preview, no file to customize, only the PR title required, no chart, chosen appearance', () => {
    const ada = JSON.parse(adoptionAdaJson(JSON.stringify({ ...DEFAULT_ADA, customize: ['README.md'], deployment: { chart: 'charts/app' } }))) as Record<string, unknown>;
    expect(ada).toMatchObject({ customize: [], requiredChecks: ['Titre de PR (Conventional Commits, semver)', 'Taille des fichiers (une responsabilité par fichier)'], deployment: null, dsfr: false, preview: DEFAULT_ADA.preview });
    expect(JSON.parse(adoptionAdaJson({ ...DEFAULT_ADA }, true))).toMatchObject({ dsfr: true });
  });

  it('project without a screen (script): the preview serves the project files, the adoption is no longer blocked', () => {
    // Real case: the analysis of a Python script returned an empty command and port.
    const analysis = { type: 'processing', checks: ['cd /app && python3 -m compileall -q .'], preview: { image: 'python:3.13-slim', main: null, port: null } };
    const ada = JSON.parse(adoptionAdaJson(analysis)) as { preview: { main: string; port: number; image: string } };
    expect(ada.preview).toMatchObject({ image: 'python:3.13-slim', main: PREVIEW_WITHOUT_SCREEN.main, port: 8000 });
    expect(JSON.parse(adoptionAdaJson({ ...analysis, preview: undefined })).preview).toMatchObject({ main: PREVIEW_WITHOUT_SCREEN.main, port: 8000 });
  });

  it('a command without a port is still refused: the port cannot be guessed', () => {
    expect(() => adoptionAdaJson({ type: 'service', checks: ['npm test'], preview: { main: 'npm run dev', port: null } })).toThrow();
  });

  it('refuses an invalid preview (the analysis could not describe it)', () => {
    expect(() => adoptionAdaJson({ preview: {} })).toThrow();
    expect(() => adoptionAdaJson(null)).toThrow();
  });

  it('PR body: stack or analysis, appearance, link to the analysis', () => {
    const body = adoptionBody({ stack: null, files: ['ada.json'], login: 'un-po', dsfr: false, analysis: 'https://github.com/un-po/mon-poc/issues/7' });
    expect(body).toContain('Aperçu décrit par l’analyse du projet');
    expect(body).toContain('celle du projet');
    expect(body).toContain('/issues/7');
  });
});
