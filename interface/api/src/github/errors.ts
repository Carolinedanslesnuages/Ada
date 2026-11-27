import { ForbiddenException, HttpException, Logger, NotFoundException } from '@nestjs/common';

const logger = new Logger('GitHub');

/** Method, address and status of the failed GitHub call — never the token. */
export function describeGithubError(error: unknown): string {
  const e = error as { status?: number; request?: { method?: string; url?: string }; message?: string };
  return `${e.request?.method ?? '?'} ${e.request?.url ?? '?'} → ${e.status ?? '?'} ${e.message ?? ''}`.trim();
}

/** Translates a GitHub API error into an HTTP error the interface can understand. */
export function translateGithubError(error: unknown): never {
  const status = (error as { status?: number }).status;
  if (status) logger.warn(describeGithubError(error));
  if (status === 404) throw new NotFoundException('Introuvable sur GitHub, ou accès non autorisé');
  if (status === 403) throw new ForbiddenException('GitHub refuse cette action pour votre compte');
  if (status === 401) throw new HttpException('Session GitHub expirée, reconnectez-vous', 401);
  throw error;
}
