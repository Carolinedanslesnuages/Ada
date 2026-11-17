import { describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { lireConfig } from '../config.js';
import { ProjetGuard } from './projet.guard.js';

const config = lireConfig({ GITHUB_PROPRIETAIRE: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32) });
const contexte = (depot: string, login = 'un-po') =>
  ({ switchToHttp: () => ({ getRequest: () => ({ params: { depot }, session: { utilisateur: { login } } }) }) }) as unknown as ExecutionContext;

describe('ProjetGuard (#37)', () => {
  const garde = new ProjetGuard(config);

  it('laisse passer les projets de l’organisation et du compte du PO', () => {
    expect(garde.canActivate(contexte('pret-de-materiel'))).toBe(true);
    expect(garde.canActivate(contexte('un-po~mon-poc'))).toBe(true);
  });

  it('refuse le projet du compte d’un autre PO, et un identifiant mal formé', () => {
    expect(() => garde.canActivate(contexte('autre-po~son-poc'))).toThrow(ForbiddenException);
    expect(() => garde.canActivate(contexte('../etc'))).toThrow(BadRequestException);
  });
});
