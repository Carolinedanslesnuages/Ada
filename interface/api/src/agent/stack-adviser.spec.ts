import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentService } from './agent.service.js';
import { prepareBench, result } from './agent.bench.js';

describe('AgentService — stack advice', () => {
  let service: AgentService;
  let launch: ReturnType<typeof prepareBench>['launch'];
  let output: string[];
  let status: string;
  let commits = '1';

  beforeEach(() => {
    status = 'in-progress';
    commits = '1';
    output = [];
    ({ service, launch } = prepareBench({ output: () => output, status: () => status, changeStatus: (created) => (status = created), commits: () => commits }));
  });

  it('advises a stack from the PO\'s idea, without any tool, among the shipped templates only (#68)', async () => {
    output = [result('{"template":"vue-node","reason":"Une petite application avec quelques écrans suffit."}')];
    expect(await service.adviseStack('les agents réservent une salle de réunion, simplement')).toEqual({
      template: 'vue-node',
      reason: 'Une petite application avec quelques écrans suffit.',
    });
    const args = launch.mock.calls[0]![0];
    expect(args).not.toContain('--allowedTools');
    expect(args.slice(args.indexOf('--disallowedTools') + 1)).toEqual(expect.arrayContaining(['Bash', 'Read', 'Write', 'WebFetch']));
    const instructions = args[args.indexOf('-p') + 1]!;
    expect(instructions).toContain('les agents réservent une salle de réunion');
    expect(instructions).toContain('- vue-node : Application en ligne');
    expect(instructions).not.toContain('django');
  });

  it('refuses an idea that is too short, and an answer outside ADA\'s list', async () => {
    await expect(service.adviseStack('salle')).rejects.toThrow(/une phrase au moins/);
    output = [result('{"template":"django","reason":"x"}')];
    await expect(service.adviseStack('les agents réservent une salle de réunion')).rejects.toThrow(/choisissez-la vous-même/);
  });

  it('caps simultaneous stack advice (each one launches an agent, without a project lock)', async () => {
    const releases: ((code: number) => void)[] = [];
    service.launchAgent = () => new Promise((ok) => releases.push(ok));
    const idea = 'Un petit outil pour réserver des salles de réunion';
    const first = [service.adviseStack(idea), service.adviseStack(idea), service.adviseStack(idea)];
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    await expect(service.adviseStack(idea)).rejects.toMatchObject({ status: 429 });
    releases.forEach((release) => release(0));
    await Promise.allSettled(first);
    service.launchAgent = launch;
    output = [result('{"template":"vue-node","reason":"Simple."}')];
    await expect(service.adviseStack(idea)).resolves.toMatchObject({ template: 'vue-node' }); // slots released
  });
});
