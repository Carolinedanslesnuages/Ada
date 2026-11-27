import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ADA } from '../ada/ada-config.js';
import type { AgentService } from './agent.service.js';
import { TOKEN, prepareBench, result } from './agent.bench.js';

describe('AgentService — adoption of an existing project', () => {
  let stories: ReturnType<typeof prepareBench>['stories'];
  let gh: ReturnType<typeof prepareBench>['gh'];
  let service: AgentService;
  let launch: ReturnType<typeof prepareBench>['launch'];
  let output: string[];
  let status: string;
  let commits = '1';

  beforeEach(() => {
    status = 'in-progress';
    commits = '1';
    output = [];
    ({ stories, gh, service, launch } = prepareBench({ output: () => output, status: () => status, changeStatus: (created) => (status = created), commits: () => commits }));
  });

  describe('adoption of an existing project (#37)', () => {
    const adoptionGh = () => {
      const calls = {
        repos: {
          get: vi.fn(async ({ repo }: { repo: string }) => ({ data: { name: repo } })),
          getContent: vi.fn(async () => Promise.reject(Object.assign(new Error('absent'), { status: 404 }))),
        },
        pulls: { list: vi.fn(async () => ({ data: [] })), create: vi.fn(async () => ({ data: { html_url: 'https://github.com/un-po/mon-poc/pull/2' } })) },
        git: {
          getRef: vi.fn(async () => ({ data: { object: { sha: 'sha-main' } } })),
          getCommit: vi.fn(async () => ({ data: { tree: { sha: 'arbre-main' } } })),
          createTree: vi.fn(async () => ({ data: { sha: 'arbre' } })),
          createCommit: vi.fn(async () => ({ data: { sha: 'commit' } })),
          createRef: vi.fn(async () => ({})),
        },
        issues: { update: vi.fn(async () => ({})) },
      };
      Object.assign(gh, calls);
      return calls;
    };
    const improvements = [
      { title: 'Tests d’accessibilité', role: 'PO du projet', need: 'un test axe par écran', benefit: 'garantir le RGAA', criteria: ['Chaque écran a son test'] },
      { title: 'Écrire AGENTS.md', role: 'PO du projet', need: 'les règles du projet', benefit: 'guider ADA', criteria: ['Commandes décrites'] },
    ];
    const analyzedAda = { type: 'service', checks: ['cd /app && npm test'], preview: { image: 'node:24-bookworm', npm: ['.'], main: 'npx vite --host 0.0.0.0 --port 5173', port: 5173 } };

    it('analyses read-only like an ADA project, opens the PR with the deduced preview, and proposes the improvements', async () => {
      const calls = adoptionGh();
      output = [result(JSON.stringify({ decision: 'adoption', text: 'Projet Vue sans tests d’accessibilité.', stories: improvements, ada: analyzedAda }))];
      await service.analyzeAdoption(TOKEN, 'un-po~mon-poc', 7, 'un-po', { template: null, dsfr: false });
      await service.lastTask;

      const args = launch.mock.calls[0]![0];
      expect(args.slice(args.indexOf('--allowedTools') + 1)).toEqual(['Skill', 'Read(./**)', 'Glob(./**)', 'Grep(./**)']);
      expect(args[1]).toContain('Analyse ce projet comme s\'il avait été créé avec ADA');
      expect(args[1]).toContain('n\'utilise PAS le DSFR');
      expect(args[1]).toContain('Le PO n’a pas indiqué de stack');

      const tree = (calls.git.createTree.mock.calls[0] as unknown as [{ tree: { path: string; content: string }[] }])[0].tree;
      const ada = JSON.parse(tree.find((file) => file.path === 'ada.json')!.content) as Record<string, unknown>;
      expect(ada).toMatchObject({ dsfr: false, checks: ['cd /app && npm test'], requiredChecks: ['Titre de PR (Conventional Commits, semver)', 'Taille des fichiers (une responsabilité par fichier)'], preview: { main: 'npx vite --host 0.0.0.0 --port 5173' } });
      expect(calls.pulls.create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'un-po', repo: 'mon-poc', head: 'ada/reprise', body: expect.stringContaining('/issues/7') }));

      const [, , , title, text] = stories.commentAsAssistant!.mock.calls[0] as string[];
      expect(title).toBe('Analyse de la reprise');
      expect(text).toContain('https://github.com/un-po/mon-poc/pull/2');
      expect(text).toContain('ada:decoupage');
      expect(status).toBe('breakdown');
    });

    it('unusable preview: falls back to the one of the stack given by the PO', async () => {
      const calls = adoptionGh();
      output = [result(JSON.stringify({ decision: 'adoption', text: 'Bilan.', stories: improvements, ada: { preview: {} } }))];
      await service.analyzeAdoption(TOKEN, 'mon-poc', 7, 'un-po', { template: 'vue-node', dsfr: true });
      await service.lastTask;
      expect(launch.mock.calls[0]![0][1]).toContain('Vue 3 + Node.js (Express)');
      const tree = (calls.git.createTree.mock.calls[0] as unknown as [{ tree: { path: string; content: string }[] }])[0].tree;
      expect(JSON.parse(tree.find((file) => file.path === 'ada.json')!.content)).toMatchObject({ dsfr: true, preview: { main: DEFAULT_ADA.preview.main } });
    });

    it('without preview or stack: no PR, a developer describes the preview', async () => {
      const calls = adoptionGh();
      output = [result(JSON.stringify({ decision: 'adoption', text: 'Bilan.', stories: improvements }))];
      await service.analyzeAdoption(TOKEN, 'mon-poc', 7, 'un-po', { template: null, dsfr: false });
      await service.lastTask;
      expect(calls.pulls.create).not.toHaveBeenCalled();
      expect(status).toBe('needs-developer');
    });

    it('nothing to improve: summary, adoption PR, and the analysis request is closed', async () => {
      const calls = adoptionGh();
      output = [result(JSON.stringify({ decision: 'adoption', text: 'Projet déjà conforme.', stories: [], ada: analyzedAda }))];
      await service.analyzeAdoption(TOKEN, 'mon-poc', 7, 'un-po', { template: null, dsfr: false });
      await service.lastTask;
      expect(calls.pulls.create).toHaveBeenCalled();
      expect(calls.issues.update).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 7, state: 'closed' }));
    });
  });
});
