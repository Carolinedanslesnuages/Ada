import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConnecteGuard } from '../auth/connecte.guard.js';
import { AgentService } from '../agent/agent.service.js';
import { StoriesService } from './stories.service.js';

const NOM_DEPOT = /^[A-Za-z0-9._-]{1,100}$/;

@Controller('projets/:depot/stories')
@UseGuards(ConnecteGuard)
export class StoriesController {
  constructor(
    private readonly stories: StoriesService,
    private readonly agent: AgentService,
  ) {}

  private depot(depot: string): string {
    if (!NOM_DEPOT.test(depot)) throw new BadRequestException('Nom de dépôt invalide');
    return depot;
  }

  @Get()
  lister(@Req() req: Request, @Param('depot') depot: string) {
    return this.stories.lister(req.session.jeton!, this.depot(depot));
  }

  @Get(':numero')
  detail(@Req() req: Request, @Param('depot') depot: string, @Param('numero', ParseIntPipe) numero: number) {
    return this.stories.detail(req.session.jeton!, this.depot(depot), numero);
  }

  /** Mode sauvage : le prompt est enregistré comme issue et lancé ; l'assistant propose un plan. */
  @Post('prompt')
  async prompter(@Req() req: Request, @Param('depot') depot: string, @Body('texte') texte: unknown) {
    this.agent.verifierDisponible();
    const demande = await this.stories.prompter(req.session.jeton!, this.depot(depot), texte, req.session.utilisateur!.login);
    await this.agent.analyser(req.session.jeton!, depot, demande.numero, req.session.utilisateur!.login);
    return demande;
  }

  /** Lance la demande, puis l'assistant commence son analyse (questions ou plan). */
  @Post(':numero/lancer')
  async lancer(@Req() req: Request, @Param('depot') depot: string, @Param('numero', ParseIntPipe) numero: number) {
    this.agent.verifierDisponible();
    const lancee = await this.stories.lancer(req.session.jeton!, this.depot(depot), numero, req.session.utilisateur!.login);
    await this.agent.analyser(req.session.jeton!, depot, numero, req.session.utilisateur!.login);
    return lancee;
  }

}
