import { Controller, Get, Inject, Logger, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { CONFIG, isLoginAllowed, type Config } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { SignedInGuard } from './signed-in.guard.js';
import { GithubOAuthService } from './github-oauth.service.js';
import type { SignedInUser } from './session.js';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly oauth: GithubOAuthService,
    private readonly github: GithubService,
  ) {}

  /** Step 1: redirects the PO to GitHub to authorize the workshop. */
  @Get('github')
  signIn(@Req() req: Request, @Res() res: Response): void {
    const state = randomBytes(16).toString('hex');
    req.session.oauthState = state;
    res.redirect(this.oauth.authorizationUrl(state));
  }

  /** Step 2: GitHub sends the PO back here with a code to exchange for a token. */
  @Get('github/callback')
  async returned(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const expected = req.session.oauthState;
    delete req.session.oauthState;
    if (!code || !state || state !== expected) {
      res.redirect(`${this.config.INTERFACE_URL}/sign-in?error=state`);
      return;
    }
    let token: Awaited<ReturnType<GithubOAuthService['exchangeCode']>>;
    try {
      token = await this.oauth.exchangeCode(code);
    } catch (e) {
      // GitHub App credentials refused, expired code…: never raw JSON for the PO.
      this.logger.warn(`GitHub code exchange refused: ${(e as Error).message}`);
      res.redirect(`${this.config.INTERFACE_URL}/sign-in?error=github`);
      return;
    }
    const { data } = await this.github.client(token.access_token).users.getAuthenticated();
    if (!isLoginAllowed(this.config, data.login)) {
      res.redirect(`${this.config.INTERFACE_URL}/sign-in?error=not-allowed`);
      return;
    }
    await new Promise<void>((ok, ko) => req.session.regenerate((e) => (e ? ko(e) : ok())));
    req.session.token = token.access_token;
    req.session.refreshToken = token.refresh_token;
    req.session.tokenExpiresAt = token.expires_in ? Date.now() + token.expires_in * 1000 : undefined;
    req.session.user = { login: data.login, name: data.name, avatar: data.avatar_url };
    res.redirect(this.config.INTERFACE_URL);
  }

  @Get('me')
  @UseGuards(SignedInGuard)
  self(@Req() req: Request): SignedInUser | undefined {
    return req.session.user;
  }

  @Post('sign-out')
  async signOut(@Req() req: Request): Promise<{ ok: true }> {
    await new Promise<void>((ok) => req.session.destroy(() => ok()));
    return { ok: true };
  }
}
