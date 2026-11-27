import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { GithubOAuthService } from './github-oauth.service.js';
import './session.js';

/**
 * Margin before the GitHub token expires beyond which it is renewed. It covers the
 * longest agent task: the worker keeps the token received at launch to push
 * the branch and open the PR, which would fail if it expired on the way.
 */
export const RENEWAL_MARGIN_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class SignedInGuard implements CanActivate {
  private readonly logger = new Logger(SignedInGuard.name);

  /** Renewals in progress, per renewal token: GitHub invalidates the old one as soon as it is used. */
  private readonly renewals = new Map<string, ReturnType<GithubOAuthService['refresh']>>();

  constructor(private readonly oauth: GithubOAuthService) {}

  /**
   * Several requests arrive together (the screen polls every 4 seconds): if each one
   * renewed, the second would present an already used token, be refused, and the PO signed out.
   * Simultaneous requests therefore share a single renewal.
   */
  private renew(renewalToken: string): ReturnType<GithubOAuthService['refresh']> {
    let inProgress = this.renewals.get(renewalToken);
    if (!inProgress) {
      inProgress = this.oauth.refresh(renewalToken).finally(() => this.renewals.delete(renewalToken));
      this.renewals.set(renewalToken, inProgress);
    }
    return inProgress;
  }

  /**
   * Requires a GitHub session and renews the token if it expires soon (see the margin above), without the PO
   * noticing. Renewal impossible: session closed, new sign-in requested.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpRequest = context.switchToHttp().getRequest<Request>();
    const session = httpRequest.session;
    if (!session?.token) throw new UnauthorizedException('Connexion GitHub requise');
    const expiresAt = session.tokenExpiresAt;
    if (!expiresAt || expiresAt - Date.now() > RENEWAL_MARGIN_MS) return true;
    if (!session.refreshToken) {
      await new Promise<void>((end) => session.destroy(() => end()));
      throw new UnauthorizedException('Session GitHub expirée, reconnectez-vous');
    }
    try {
      const created = await this.renew(session.refreshToken);
      session.token = created.access_token;
      session.refreshToken = created.refresh_token ?? session.refreshToken;
      session.tokenExpiresAt = created.expires_in ? Date.now() + created.expires_in * 1000 : undefined;
      return true;
    } catch (error) {
      this.logger.warn(`Token renewal refused: ${(error as Error).message}`);
      await new Promise<void>((end) => session.destroy(() => end()));
      throw new UnauthorizedException('Session GitHub expirée, reconnectez-vous');
    }
  }
}
