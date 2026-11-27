import type { INestApplication } from '@nestjs/common';
import session from 'express-session';
import { EncryptedSessionStore } from './auth/session-store.js';
import type { Config } from './config.js';

/** Settings shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication, config: Config): void {
  app.setGlobalPrefix('api', { exclude: ['__version__', 'api/__version__'] });
  app.use(
    session({
      name: 'atelier.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: new EncryptedSessionStore(config.SESSIONS_DIR, config.SESSION_SECRET),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );
}
