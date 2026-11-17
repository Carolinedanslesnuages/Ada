import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CONFIG, type Config } from '../config.js';
import { lireIdentifiant, verifierAcces } from './depot.js';
import '../auth/session.js';

/**
 * Toute route `projets/:depot/…` : identifiant bien formé, et projet de l'organisation d'ADA ou
 * du compte du PO connecté. À placer après ConnecteGuard.
 */
@Injectable()
export class ProjetGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  canActivate(contexte: ExecutionContext): boolean {
    const requete = contexte.switchToHttp().getRequest<Request>();
    const id = String(requete.params.depot ?? '');
    const cible = lireIdentifiant(id, this.config.GITHUB_PROPRIETAIRE);
    verifierAcces(cible, requete.session.utilisateur?.login ?? '', this.config.GITHUB_PROPRIETAIRE);
    return true;
  }
}
