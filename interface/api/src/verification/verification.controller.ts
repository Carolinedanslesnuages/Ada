import { Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConnecteGuard } from '../auth/connecte.guard.js';
import { VerificationService } from './verification.service.js';

@Controller('projets/:depot/stories/:numero')
@UseGuards(ConnecteGuard)
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get('verification')
  verifier(@Req() req: Request, @Param('depot') depot: string, @Param('numero', ParseIntPipe) numero: number) {
    return this.verification.verifier(req.session.jeton!, depot, numero);
  }

  @Post('fusionner')
  fusionner(@Req() req: Request, @Param('depot') depot: string, @Param('numero', ParseIntPipe) numero: number) {
    return this.verification.fusionner(req.session.jeton!, depot, numero);
  }
}
