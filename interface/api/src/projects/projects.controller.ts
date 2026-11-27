import { Body, Controller, Get, Logger, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectsService } from './projects.service.js';
import { AdoptionService } from './adoption.service.js';
import { RegistryService } from '../indicators/registry.service.js';
import { AgentService } from '../agent/agent.service.js';

@Controller('projects')
@UseGuards(SignedInGuard)
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);

  constructor(
    private readonly projects: ProjectsService,
    private readonly adoption: AdoptionService,
    private readonly registry: RegistryService,
    private readonly agent: AgentService,
  ) {}

  /** Creation (#68): the assistant reads the PO's idea and proposes the best-suited stack, with a reason. */
  @Post('stack-advice')
  adviseStack(@Body('idea') idea: unknown) {
    return this.agent.adviseStack(idea);
  }

  @Get()
  list(@Req() req: Request) {
    return this.projects.list(req.session.token!, req.session.user!.login);
  }

  @Get('templates')
  templates(@Req() req: Request) {
    return this.projects.templates();
  }

  /** Repositories of the organization and of the PO's account that are not in ADA yet (#37). */
  @Get('to-adopt')
  toAdopt(@Req() req: Request) {
    return this.adoption.list(req.session.token!, req.session.user!.login);
  }

  /** Adoption of an existing repository: ADA opens an “adoption by ADA” PR that the PO approves. */
  @Post('adopt')
  async adopt(@Req() req: Request, @Body() body: unknown) {
    const result = await this.adoption.adopt(req.session.token!, req.session.user!.login, body);
    await this.registry.record(result.id, 'adopted', req.session.user!.login);
    return result;
  }

  @Post()
  async create(@Req() req: Request, @Body() body: unknown) {
    const login = req.session.user!.login;
    const result = await this.projects.create(req.session.token!, login, body);
    await this.registry.record(result.project.id, 'created', login);
    // The starting idea (#68): the assistant takes it up at once, as for “Prompt”.
    if (result.idea) {
      try {
        this.agent.checkAvailable();
        await this.agent.analyze(req.session.token!, result.project.id, result.idea, login);
      } catch (e) {
        this.logger.warn(`Idea of ${result.project.id} not launched: ${(e as Error).message}`);
      }
    }
    return result;
  }
}
