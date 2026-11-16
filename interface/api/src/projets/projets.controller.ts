import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConnecteGuard } from '../auth/connecte.guard.js';
import { ProjetsService } from './projets.service.js';

@Controller('projets')
@UseGuards(ConnecteGuard)
export class ProjetsController {
  constructor(private readonly projets: ProjetsService) {}

  @Get()
  lister(@Req() req: Request) {
    return this.projets.lister(req.session.jeton!, req.session.utilisateur!.login);
  }

  @Get('modeles')
  modeles(@Req() req: Request) {
    return this.projets.modeles(req.session.jeton!);
  }

  @Post()
  creer(@Req() req: Request, @Body() corps: unknown) {
    return this.projets.creer(req.session.jeton!, req.session.utilisateur!.login, corps);
  }
}
