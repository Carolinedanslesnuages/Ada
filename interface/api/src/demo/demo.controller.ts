import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectGuard } from '../projects/project.guard.js';
import { DemoService } from './demo.service.js';

@Controller('projects/:repository/demo')
@UseGuards(SignedInGuard, ProjectGuard)
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get()
  state(@Param('repository') repository: string) {
    return this.demo.state(repository);
  }

  @Post()
  start(@Req() req: Request, @Param('repository') repository: string) {
    return this.demo.start(req.session.token!, repository);
  }
}
