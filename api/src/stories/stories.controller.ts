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
import { StoriesService } from './stories.service.js';

const NOM_DEPOT = /^[A-Za-z0-9._-]{1,100}$/;

@Controller('projets/:depot/stories')
@UseGuards(ConnecteGuard)
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  private depot(depot: string): string {
    if (!NOM_DEPOT.test(depot)) throw new BadRequestException('Nom de dépôt invalide');
    return depot;
  }

  @Get()
  lister(@Req() req: Request, @Param('depot') depot: string) {
    return this.stories.lister(req.session.jeton!, this.depot(depot));
  }

  @Post()
  creer(@Req() req: Request, @Param('depot') depot: string, @Body() corps: unknown) {
    return this.stories.creer(req.session.jeton!, this.depot(depot), corps);
  }

  @Get(':numero')
  detail(@Req() req: Request, @Param('depot') depot: string, @Param('numero', ParseIntPipe) numero: number) {
    return this.stories.detail(req.session.jeton!, this.depot(depot), numero);
  }

  @Post(':numero/messages')
  repondre(
    @Req() req: Request,
    @Param('depot') depot: string,
    @Param('numero', ParseIntPipe) numero: number,
    @Body('texte') texte: string,
  ) {
    return this.stories.repondre(req.session.jeton!, this.depot(depot), numero, texte);
  }
}
