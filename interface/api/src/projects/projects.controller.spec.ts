import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { ProjectsController } from './projects.controller.js';
import type { ProjectsService } from './projects.service.js';
import type { AdoptionService } from './adoption.service.js';
import type { RegistryService } from '../indicators/registry.service.js';
import type { AgentService } from '../agent/agent.service.js';

const httpRequest = { session: { token: 'token', user: { login: 'un-po' } } } as unknown as Request;

const mount = (idea: number | null, isAgentAvailable = true) => {
  const projects = { create: vi.fn(async () => ({ project: { id: 'covoiturage' }, settings: {}, idea })) };
  const registry = { record: vi.fn(async () => undefined) };
  const agent = {
    checkAvailable: vi.fn(() => {
      if (!isAgentAvailable) throw new Error('Aucun agent');
    }),
    analyze: vi.fn(async () => undefined),
  };
  const controller = new ProjectsController(
    projects as unknown as ProjectsService,
    {} as AdoptionService,
    registry as unknown as RegistryService,
    agent as unknown as AgentService,
  );
  return { controller, agent };
};

describe('Project creation (route)', () => {
  it('launches ADA right away on the starting idea (#68)', async () => {
    const { controller, agent } = mount(1);
    await expect(controller.create(httpRequest, {})).resolves.toMatchObject({ idea: 1 });
    expect(agent.analyze).toHaveBeenCalledWith('token', 'covoiturage', 1, 'un-po');
  });

  it('without an idea, nothing is launched; without an assistant, the creation still succeeds', async () => {
    const withoutIdea = mount(null);
    await withoutIdea.controller.create(httpRequest, {});
    expect(withoutIdea.agent.analyze).not.toHaveBeenCalled();
    const withoutAgent = mount(1, false);
    await expect(withoutAgent.controller.create(httpRequest, {})).resolves.toMatchObject({ idea: 1 });
    expect(withoutAgent.agent.analyze).not.toHaveBeenCalled();
  });
});
