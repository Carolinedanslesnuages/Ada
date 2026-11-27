import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { readConfig } from './config.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  const config = readConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app, config);
  await app.listen(config.PORT);
}
await bootstrap();
