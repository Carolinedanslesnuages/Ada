import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectGuard } from './project.guard.js';
import { ProjectsService } from './projects.service.js';

/** When a project is opened: ADA checks that its main branch is protected, and protects it otherwise. */
@Controller('projects/:repository/protection')
@UseGuards(SignedInGuard, ProjectGuard)
export class ProtectionController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  ensure(@Req() req: Request, @Param('repository') repository: string) {
    return this.projects.ensureProtection(req.session.token!, repository);
  }

  /** Adopted project: the PO accepts that ADA protects the main branch. */
  @Post('apply')
  apply(@Req() req: Request, @Param('repository') repository: string) {
    return this.projects.protectOnDemand(req.session.token!, repository, req.session.user!.login);
  }

  /** Adopted project: the PO does not want to protect it; ADA no longer asks. */
  @Post('refuse')
  refuse(@Req() req: Request, @Param('repository') repository: string) {
    return this.projects.refuseProtection(repository, req.session.user!.login);
  }
}
