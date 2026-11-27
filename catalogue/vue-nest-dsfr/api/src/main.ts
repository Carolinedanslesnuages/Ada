import process from 'node:process'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { configurerApp } from './configurer-app.js'
import 'dotenv/config'

async function bootstrap () {
  const app = await NestFactory.create(AppModule)
  configurerApp(app)
  await app.listen(process.env.PORT ?? 3000)
}
// Une erreur au démarrage arrête le processus (Node affiche la cause).
void bootstrap()
