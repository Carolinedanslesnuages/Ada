import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import { AppModule } from './app.module.js';
import { lireConfig } from './config.js';

async function bootstrap() {
  const config = lireConfig();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(
    session({
      name: 'atelier.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      // Magasin en mémoire : suffisant en développement (sessions perdues au redémarrage).
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );
  await app.listen(config.PORT);
}
await bootstrap();
