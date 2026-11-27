import { Module } from '@nestjs/common';
import { AgentController } from './agent/agent.controller.js';
import { ProjectFootprintController } from './footprint/footprint.controller.js';
import { AgentService } from './agent/agent.service.js';
import { PreviewController } from './preview/preview.controller.js';
import { PreviewService } from './preview/preview.service.js';
import { AuthController } from './auth/auth.controller.js';
import { GithubOAuthService } from './auth/github-oauth.service.js';
import { CONFIG, readConfig, type Config } from './config.js';
import { DiagnosticController } from './diagnostic/diagnostic.controller.js';
import { GithubService } from './github/github.service.js';
import { UserModelController } from './user-model/user-model.controller.js';
import { UserModelStore } from './user-model/user-model.js';
import { ProjectsController } from './projects/projects.controller.js';
import { IndicatorsController } from './indicators/indicators.controller.js';
import { IndicatorsService } from './indicators/indicators.service.js';
import { RegistryService } from './indicators/registry.service.js';
import { DemoController } from './demo/demo.controller.js';
import { DemoService } from './demo/demo.service.js';
import { ProjectsService } from './projects/projects.service.js';
import { ProtectionController } from './projects/protection.controller.js';
import { AdoptionService } from './projects/adoption.service.js';
import { AdoptionController } from './projects/adoption.controller.js';
import { StoriesController } from './stories/stories.controller.js';
import { WorkRequestStore } from './stories/work-requests.js';
import { StoriesService } from './stories/stories.service.js';
import { VerificationController } from './verification/verification.controller.js';
import { VerificationService } from './verification/verification.service.js';
import { VersionController } from './version/version.controller.js';
import { VersionsController } from './versions/versions.controller.js';
import { VersionsService } from './versions/versions.service.js';

@Module({
  controllers: [AgentController, UserModelController, DemoController, ProjectFootprintController, IndicatorsController, PreviewController, AuthController, DiagnosticController, ProjectsController, ProtectionController, AdoptionController, StoriesController, VerificationController, VersionController, VersionsController],
  providers: [
    { provide: CONFIG, useFactory: () => readConfig() },
    { provide: UserModelStore, useFactory: (config: Config) => new UserModelStore(config.USER_MODELS_DIR, config.SESSION_SECRET), inject: [CONFIG] },
    AgentService,
    PreviewService,
    DemoService,
    GithubService,
    GithubOAuthService,
    IndicatorsService,
    RegistryService,
    ProjectsService,
    AdoptionService,
    WorkRequestStore,
    StoriesService,
    VerificationService,
    VersionsService,
  ],
})
export class AppModule {}
