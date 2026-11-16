import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConnecteGuard } from '../auth/connecte.guard.js';
import { AgentService } from './agent.service.js';

@Controller('projets/:depot/stories/:numero')
@UseGuards(ConnecteGuard)
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get('activite')
  activite(@Param('depot') depot: string, @Param('numero', ParseIntPipe) numero: number) {
    return this.agent.activite(depot, numero);
  }

  @Post('plan/valider')
  async valider(@Req() req: Request, @Param('depot') depot: string, @Param('numero', ParseIntPipe) numero: number) {
    await this.agent.validerPlan(req.session.jeton!, req.session.utilisateur!.login, depot, numero);
    return { ok: true };
  }

  @Post('relancer')
  async relancer(@Req() req: Request, @Param('depot') depot: string, @Param('numero', ParseIntPipe) numero: number) {
    await this.agent.relancer(req.session.jeton!, depot, numero);
    return { ok: true };
  }

  /** Réponse aux questions, ou demande de modification du plan : l'assistant reprend son analyse. */
  @Post('reponse')
  async repondre(
    @Req() req: Request,
    @Param('depot') depot: string,
    @Param('numero', ParseIntPipe) numero: number,
    @Body('texte') texte: string,
  ) {
    await this.agent.reprendreAnalyse(req.session.jeton!, depot, numero, texte);
    return { ok: true };
  }
}
