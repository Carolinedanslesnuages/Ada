import { Module } from '@nestjs/common';
import { AgentController } from './agent/agent.controller.js';
import { AgentService } from './agent/agent.service.js';
import { ApercuController } from './apercu/apercu.controller.js';
import { ApercuService } from './apercu/apercu.service.js';
import { AuthController } from './auth/auth.controller.js';
import { GithubOAuthService } from './auth/github-oauth.service.js';
import { CONFIG, lireConfig } from './config.js';
import { DiagnosticController } from './diagnostic/diagnostic.controller.js';
import { GithubService } from './github/github.service.js';
import { ProjetsController } from './projets/projets.controller.js';
import { ProjetsService } from './projets/projets.service.js';
import { StoriesController } from './stories/stories.controller.js';
import { StoriesService } from './stories/stories.service.js';
import { VersionController } from './version/version.controller.js';

@Module({
  controllers: [AgentController, ApercuController, AuthController, DiagnosticController, ProjetsController, StoriesController, VersionController],
  providers: [
    { provide: CONFIG, useFactory: () => lireConfig() },
    AgentService,
    ApercuService,
    GithubService,
    GithubOAuthService,
    ProjetsService,
    StoriesService,
  ],
})
export class AppModule {}
