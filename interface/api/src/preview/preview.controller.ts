import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectGuard } from '../projects/project.guard.js';
import { PreviewService } from './preview.service.js';

@Controller('projects/:repository/preview')
@UseGuards(SignedInGuard, ProjectGuard)
export class PreviewController {
  constructor(private readonly preview: PreviewService) {}

  @Get()
  state(@Param('repository') repository: string) {
    return this.preview.state(repository);
  }

  @Post()
  start(@Req() req: Request, @Param('repository') repository: string) {
    return this.preview.start(req.session.token!, repository);
  }
}
