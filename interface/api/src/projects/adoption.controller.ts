import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectGuard } from './project.guard.js';
import { AdoptionService } from './adoption.service.js';

/** Adoption launched (#37): tracking of the analysis, then approval of the adoption PR from ADA. */
@Controller('projects/:repository/adoption')
@UseGuards(SignedInGuard, ProjectGuard)
export class AdoptionController {
  constructor(private readonly adoption: AdoptionService) {}

  @Get()
  state(@Req() req: Request, @Param('repository') repository: string) {
    return this.adoption.state(req.session.token!, repository);
  }

  @Post('checks/rerun')
  rerunChecks(@Req() req: Request, @Param('repository') repository: string) {
    return this.adoption.rerunChecks(req.session.token!, repository);
  }

  /** Cancels a pending adoption, or unlinks an adopted project; nothing is deleted. */
  @Post('cancel')
  cancel(@Req() req: Request, @Param('repository') repository: string) {
    return this.adoption.cancel(req.session.token!, req.session.user!.login, repository);
  }

  @Post('merge')
  merge(@Req() req: Request, @Param('repository') repository: string) {
    return this.adoption.merge(req.session.token!, repository);
  }
}
