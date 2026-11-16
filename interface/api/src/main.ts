import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { lireConfig } from './config.js';
import { configurerApp } from './configurer-app.js';

async function bootstrap() {
  const config = lireConfig();
  const app = await NestFactory.create(AppModule);
  configurerApp(app, config);
  await app.listen(config.PORT);
}
await bootstrap();
