import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { IndicatorsService } from './indicators.service.js';

@Controller('indicators')
@UseGuards(SignedInGuard)
export class IndicatorsController {
  constructor(private readonly indicators: IndicatorsService) {}

  /** Estimated carbon footprint of ADA's usage (EcoLogits method, ADEME equivalents). */
  @Get('footprint')
  footprint(@Req() req: Request) {
    return this.indicators.footprint(req.session.token!, req.session.user!.login);
  }

  @Get()
  read(@Req() req: Request) {
    return this.indicators.compute(req.session.token!, req.session.user!.login);
  }
}
