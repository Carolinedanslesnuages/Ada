import { BadRequestException, Body, Controller, Delete, Get, Inject, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { CONFIG, type Config } from '../config.js';
import { UserModelStore, testGateway, validateModel, checkResolution, toPublic, type UserModel, type TestResult } from './user-model.js';

/** “My model”: the user's language model (address, key, name). The key is never returned. */
@Controller('model')
@UseGuards(SignedInGuard)
export class UserModelController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly store: UserModelStore,
  ) {}

  private login(req: Request): string {
    return req.session.user!.login;
  }

  /** Validates the input; a key left empty keeps the one already saved (if the address did not change). */
  private async readInput(req: Request, body: unknown): Promise<UserModel> {
    const { value, errors } = validateModel(body);
    if (!value) throw new BadRequestException({ errors });
    const refusal = await checkResolution(new URL(value.address).hostname);
    if (refusal) throw new BadRequestException({ errors: { address: refusal } });
    const existing = await this.store.read(this.login(req));
    // The saved key only goes to the address it was given for.
    const key = value.key ?? (existing && existing.address === value.address ? existing.key : '');
    return { address: value.address, key, model: value.model };
  }

  @Get()
  async read(@Req() req: Request) {
    return { ...toPublic(await this.store.read(this.login(req))), defaults: this.config.AGENT_MODEL || null };
  }

  @Put()
  async save(@Req() req: Request, @Body() body: unknown) {
    const model = await this.readInput(req, body);
    await this.store.save(this.login(req), model);
    return { ...toPublic(model), defaults: this.config.AGENT_MODEL || null };
  }

  @Delete()
  async remove(@Req() req: Request) {
    await this.store.remove(this.login(req));
    return { ...toPublic(null), defaults: this.config.AGENT_MODEL || null };
  }

  /** Tries the gateway with the current input (without saving it). */
  @Post('test')
  async test(@Req() req: Request, @Body() body: unknown): Promise<TestResult> {
    return testGateway(await this.readInput(req, body));
  }
}
