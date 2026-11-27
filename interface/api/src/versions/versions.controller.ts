import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectGuard } from '../projects/project.guard.js';
import { VersionsService } from './versions.service.js';

@Controller('projects/:repository/versions')
@UseGuards(SignedInGuard, ProjectGuard)
export class VersionsController {
  constructor(private readonly versions: VersionsService) {}

  @Get()
  read(@Req() req: Request, @Param('repository') repository: string) {
    return this.versions.read(req.session.token!, repository);
  }

  @Post('publish')
  publish(@Req() req: Request, @Param('repository') repository: string) {
    return this.versions.publish(req.session.token!, repository);
  }
}
