import { Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectGuard } from '../projects/project.guard.js';
import { VerificationService } from './verification.service.js';

@Controller('projects/:repository/stories/:number')
@UseGuards(SignedInGuard, ProjectGuard)
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get('verification')
  verify(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    return this.verification.verify(req.session.token!, repository, number);
  }

  /** Checks GitHub did not run (billing): rerun once the cause is fixed. */
  @Post('checks/rerun')
  rerunChecks(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    return this.verification.rerunChecks(req.session.token!, repository, number);
  }

  @Post('merge')
  merge(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    return this.verification.merge(req.session.token!, repository, number);
  }
}
