import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConnecteGuard } from '../auth/connecte.guard.js';
import { VersionsService } from './versions.service.js';

@Controller('projets/:depot/versions')
@UseGuards(ConnecteGuard)
export class VersionsController {
  constructor(private readonly versions: VersionsService) {}

  @Get()
  lire(@Req() req: Request, @Param('depot') depot: string) {
    return this.versions.lire(req.session.jeton!, depot);
  }

  @Post('publier')
  publier(@Req() req: Request, @Param('depot') depot: string) {
    return this.versions.publier(req.session.jeton!, depot);
  }
}
