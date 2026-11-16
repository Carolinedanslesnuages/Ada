import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { GithubOAuthService } from './github-oauth.service.js';
import './session.js';

/** Marge avant l'expiration du jeton GitHub au-delà de laquelle on le renouvelle. */
export const MARGE_RENOUVELLEMENT_MS = 5 * 60 * 1000;

@Injectable()
export class ConnecteGuard implements CanActivate {
  private readonly journal = new Logger(ConnecteGuard.name);

  constructor(private readonly oauth: GithubOAuthService) {}

  /**
   * Exige une session GitHub et renouvelle le jeton s'il expire bientôt, sans que le PO s'en
   * aperçoive. Renouvellement impossible : session fermée, reconnexion demandée.
   */
  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const requete = contexte.switchToHttp().getRequest<Request>();
    const session = requete.session;
    if (!session?.jeton) throw new UnauthorizedException('Connexion GitHub requise');
    const expireLe = session.jetonExpireLe;
    if (!expireLe || expireLe - Date.now() > MARGE_RENOUVELLEMENT_MS) return true;
    if (!session.jetonRafraichissement) {
      await new Promise<void>((fin) => session.destroy(() => fin()));
      throw new UnauthorizedException('Session GitHub expirée, reconnectez-vous');
    }
    try {
      const nouveau = await this.oauth.rafraichir(session.jetonRafraichissement);
      session.jeton = nouveau.access_token;
      session.jetonRafraichissement = nouveau.refresh_token ?? session.jetonRafraichissement;
      session.jetonExpireLe = nouveau.expires_in ? Date.now() + nouveau.expires_in * 1000 : undefined;
      return true;
    } catch (erreur) {
      this.journal.warn(`Renouvellement du jeton refusé : ${(erreur as Error).message}`);
      await new Promise<void>((fin) => session.destroy(() => fin()));
      throw new UnauthorizedException('Session GitHub expirée, reconnectez-vous');
    }
  }
}
