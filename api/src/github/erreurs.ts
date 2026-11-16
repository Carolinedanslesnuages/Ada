import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';

/** Traduit une erreur de l'API GitHub en erreur HTTP compréhensible pour l'interface. */
export function traduireErreurGithub(erreur: unknown): never {
  const statut = (erreur as { status?: number }).status;
  if (statut === 404) throw new NotFoundException('Introuvable sur GitHub, ou accès non autorisé');
  if (statut === 403) throw new ForbiddenException('GitHub refuse cette action pour votre compte');
  if (statut === 401) throw new HttpException('Session GitHub expirée, reconnectez-vous', 401);
  throw erreur;
}
