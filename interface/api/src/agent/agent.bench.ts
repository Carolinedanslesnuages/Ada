/**
 * Test bench of the agent tests: AgentService assembled with a fake GitHub, a fake preview, fake
 * stories and a fake agent whose output is set test by test. Shared by the *.spec.ts files of the
 * folder; never compiled into the application (tsconfig.build.json).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { DEFAULT_ADA } from '../ada/ada-config.js';
import type { PreviewService } from '../preview/preview.service.js';
import { readConfig } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import type { ProjectsService } from '../projects/projects.service.js';
import { ADOPTION_FILES } from '../projects/adoption.js';
import type { StoriesService } from '../stories/stories.service.js';
import { AgentService } from './agent.service.js';
import type { AgentLauncher } from './launch.js';

export const TOKEN = 'jeton-du-po';
/** Footprint log of the tests: never ADA's. */
export const TRIAL_REGISTRY = mkdtempSync(join(tmpdir(), 'registre-'));
export const config = (agent = '/bin/agent') =>
  readConfig({
    GITHUB_OWNER: 'proprio',
    GITHUB_CLIENT_ID: 'Iv',
    GITHUB_CLIENT_SECRET: 's',
    SESSION_SECRET: 'x'.repeat(32),
    AGENT_COMMAND: agent,
    // The tests do not depend on the skills submodules: no skill, except when a test provides one.
    AGENT_SKILLS: '',
    REGISTRY_DIR: TRIAL_REGISTRY,
  });

export const result = (text: string) => JSON.stringify({ type: 'result', subtype: 'success', result: text });
export const action = (name: string, input: Record<string, unknown>) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

/** Minimal catalog for the adoption (#37): common files and ada.json of the reference template. */
const adoptionCatalog = mkdtempSync(join(tmpdir(), 'agent-catalogue-'));
for (const file of [...ADOPTION_FILES, 'ada.json']) {
  mkdirSync(join(adoptionCatalog, 'vue-node', file, '..'), { recursive: true });
  writeFileSync(join(adoptionCatalog, 'vue-node', file), file === 'ada.json' ? JSON.stringify(DEFAULT_ADA) : `contenu de ${file}`);
}
export const projects = {
  catalogFolder: adoptionCatalog,
  templates: () => ({
    templates: [
      { id: 'vue-node', type: 'service', label: 'Vue 3 + Node.js (Express), avec DSFR', purpose: 'Petite application', available: true },
      { id: 'django', type: 'gestion', label: 'Python (Django)', purpose: 'Back-office', available: false },
    ],
    types: [{ id: 'service', label: 'Application en ligne', description: 'Des écrans et des règles' }],
  }),
};

/** The test story, with the given status. */
export const trialDetail = (status: string) => ({
  number: 1,
  title: 'Page d’accueil',
  type: 'story',
  status,
  content: { role: 'agent', need: 'voir ma journée', benefit: 'm’organiser', criteria: ['title'] },
  bugContent: null,
  freeContent: null,
  messages: [
    { id: 1, author: 'po', text: 'Discussion avant lancement', at: '' },
    { id: 2, author: 'po', text: '▶️ Lancée depuis ADA par po1.', at: '' },
    { id: 3, author: 'po', text: '<!-- atelier-po:assistant -->\n🤖 **Plan proposé**\n\nJe vais…', at: '' },
    { id: 4, author: 'po', text: 'D’accord', at: '' },
  ],
});

type Mock = ReturnType<typeof vi.fn>;
export interface FakePreview {
  projectsWithAgent: Mock;
  recordUse: Mock;
  isAsleep: Mock;
  start: Mock;
  restartApplication: Mock;
  readConfig: Mock;
  repositoryPath: Mock;
  prepareRepository: Mock;
  run: Mock;
  gitEnvironment: Mock;
}

/** What each test sets as it pleases: read by the fakes at call time. */
export interface Settings {
  output: () => string[];
  status: () => string;
  changeStatus: (status: string) => void;
  commits: () => string;
}

/** Assembles the bench (to call in a beforeEach): fresh working folder, brand-new fakes. */
export function prepareBench(settings: Settings) {
  const root = mkdtempSync(join(tmpdir(), 'agent-'));
  const stories: Record<string, Mock> = {
    detail: vi.fn(async () => trialDetail(settings.status())),
    list: vi.fn(async () => [{ number: 30, title: 'Service', type: 'story', status: 'parent', closedAt: null, parent: null }, { number: 31, title: 'Envoyer les e-mails', type: 'story', closedAt: null, parent: 30 }, { number: 1, title: 'Moi-même', type: 'story', closedAt: null }]),
    // The agent reads the frozen request and ADA's log: here, what “detail” describes at this moment.
    frozenWorkRequest: vi.fn(async (...args: unknown[]) => {
      const d = (await (stories.detail as (...a: unknown[]) => Promise<ReturnType<typeof trialDetail>>)(...args)) as ReturnType<typeof trialDetail>;
      return {
        frozen: { number: d.number, title: d.title, type: d.type, content: d.content, bugContent: d.bugContent, freeContent: d.freeContent, parent: null, launchedAt: '', launchedBy: 'po1' },
        messages: d.messages,
      };
    }),
    commentAsAssistant: vi.fn(async () => undefined),
    changeStatus: vi.fn(async (_j: string, _d: string, _n: number, s: string) => {
      settings.changeStatus(s);
    }),
    reply: vi.fn(async () => ({})),
  };
  const preview: FakePreview = {
    projectsWithAgent: vi.fn(async (): Promise<string[]> => []),
    recordUse: vi.fn(),
    isAsleep: vi.fn(() => false),
    start: vi.fn(async () => ({ state: 'starting', url: null, log: null })),
    restartApplication: vi.fn(async () => {}),
    readConfig: vi.fn(async () => DEFAULT_ADA),
    repositoryPath: vi.fn((project: string) => join(root, project, 'depot')),
    prepareRepository: vi.fn(async (_j: string, project: string) => join(root, project, 'depot')),
    gitEnvironment: vi.fn(() => ({ GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic secret' })),
    run: vi.fn(async (_c: string, args: string[]) => ({
      stdout: args.includes('rev-list') ? `${settings.commits()}\n` : args.includes('rev-parse') ? 'main\n' : '',
    })),
  };
  const gh = {
    pulls: { create: vi.fn(async () => ({ data: { html_url: 'https://github.com/proprio/poc/pull/2' } })) },
    repos: { get: vi.fn(async ({ repo }: { repo: string }) => ({ data: { name: repo } })) },
  };
  const service = new AgentService(
    { ...config(), PREVIEWS_DIR: root },
    { client: () => gh } as unknown as GithubService,
    stories as unknown as StoriesService,
    preview as unknown as PreviewService,
    projects as unknown as ProjectsService,
  );
  const launch = vi.fn<AgentLauncher>(async (_args, _cwd, onLine) => {
    settings.output().forEach(onLine);
    return 0;
  });
  service.launchAgent = launch;
  return { root, stories, preview, gh, service, launch };
}
