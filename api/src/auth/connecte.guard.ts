import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import './session.js';

@Injectable()
export class ConnecteGuard implements CanActivate {
  canActivate(contexte: ExecutionContext): boolean {
    const requete = contexte.switchToHttp().getRequest<Request>();
    if (!requete.session?.jeton) throw new UnauthorizedException('Connexion GitHub requise');
    return true;
  }
}
