import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConnecteGuard } from '../auth/connecte.guard.js';
import { ProjetsService } from './projets.service.js';
import { RepriseService } from './reprise.service.js';

@Controller('projets')
@UseGuards(ConnecteGuard)
export class ProjetsController {
  constructor(
    private readonly projets: ProjetsService,
    private readonly reprise: RepriseService,
  ) {}

  @Get()
  lister(@Req() req: Request) {
    return this.projets.lister(req.session.jeton!, req.session.utilisateur!.login);
  }

  @Get('modeles')
  modeles(@Req() req: Request) {
    return this.projets.modeles();
  }

  /** Dépôts de l'organisation et du compte du PO qui ne sont pas encore dans ADA (#37). */
  @Get('a-reprendre')
  aReprendre(@Req() req: Request) {
    return this.reprise.lister(req.session.jeton!, req.session.utilisateur!.login);
  }

  /** Reprise d'un dépôt existant : ADA ouvre une PR « reprise par ADA » que le PO valide. */
  @Post('reprendre')
  reprendre(@Req() req: Request, @Body() corps: unknown) {
    return this.reprise.reprendre(req.session.jeton!, req.session.utilisateur!.login, corps);
  }

  @Post()
  creer(@Req() req: Request, @Body() corps: unknown) {
    return this.projets.creer(req.session.jeton!, req.session.utilisateur!.login, corps);
  }
}
