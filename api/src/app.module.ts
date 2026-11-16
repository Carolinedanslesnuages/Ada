import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller.js';
import { GithubOAuthService } from './auth/github-oauth.service.js';
import { CONFIG, lireConfig } from './config.js';
import { GithubService } from './github/github.service.js';
import { ProjetsController } from './projets/projets.controller.js';
import { ProjetsService } from './projets/projets.service.js';
import { StoriesController } from './stories/stories.controller.js';
import { StoriesService } from './stories/stories.service.js';
import { VersionController } from './version/version.controller.js';

@Module({
  controllers: [AuthController, ProjetsController, StoriesController, VersionController],
  providers: [
    { provide: CONFIG, useFactory: () => lireConfig() },
    GithubService,
    GithubOAuthService,
    ProjetsService,
    StoriesService,
  ],
})
export class AppModule {}
