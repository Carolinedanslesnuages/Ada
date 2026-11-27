import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectGuard } from '../projects/project.guard.js';
import { AgentService } from '../agent/agent.service.js';

/** Estimated carbon footprint of a project, all requests combined: displayed on the project home. */
@Controller('projects/:repository/footprint')
@UseGuards(SignedInGuard, ProjectGuard)
export class ProjectFootprintController {
  constructor(private readonly agent: AgentService) {}

  @Get()
  read(@Param('repository') repository: string) {
    return this.agent.projectFootprint(repository);
  }
}
