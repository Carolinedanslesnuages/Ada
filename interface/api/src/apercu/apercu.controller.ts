import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConnecteGuard } from '../auth/connecte.guard.js';
import { ProjetGuard } from '../projets/projet.guard.js';
import { ApercuService } from './apercu.service.js';

@Controller('projets/:depot/apercu')
@UseGuards(ConnecteGuard, ProjetGuard)
export class ApercuController {
  constructor(private readonly apercu: ApercuService) {}

  @Get()
  etat(@Param('depot') depot: string) {
    return this.apercu.etat(depot);
  }

  @Post()
  demarrer(@Req() req: Request, @Param('depot') depot: string) {
    return this.apercu.demarrer(req.session.jeton!, depot);
  }
}
