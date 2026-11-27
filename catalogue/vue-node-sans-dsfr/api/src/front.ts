import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Pages of the application served per minute and per address before answering 429. */
export const PAGES_PER_MINUTE = 300;

/**
 * En production (image Docker), l'API sert aussi le front construit : une seule image à déployer.
 * Les adresses qui ne sont ni /api ni un fichier renvoient index.html (navigation de l'application).
 */
export function servirFront(app: Express, dossier: string, pagesPerMinute = PAGES_PER_MINUTE): void {
  const racine = resolve(dossier);
  const index = join(racine, 'index.html');
  if (!existsSync(index)) throw new Error(`Front construit introuvable : ${index}`);
  // Each page reads index.html from the disk: a rate limit keeps a flood of requests from exhausting
  // the server. Behind a reverse proxy every visitor shares the proxy address, hence a generous limit
  // and no warning about the X-Forwarded-For header.
  const pageRateLimit = rateLimit({
    windowMs: 60_000,
    limit: pagesPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: 'Trop de demandes : réessayez dans une minute.',
  });
  app.use(express.static(racine, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api(\/|$)|\/__version__$).*/, pageRateLimit, (_requete, reponse) => {
    reponse.set('Cache-Control', 'no-cache').sendFile(index);
  });
}
