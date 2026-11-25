import { Module } from '@nestjs/common';
import { AgentController } from './agent/agent.controller.js';
import { EmpreinteProjetController } from './empreinte/empreinte.controller.js';
import { AgentService } from './agent/agent.service.js';
import { ApercuController } from './apercu/apercu.controller.js';
import { ApercuService } from './apercu/apercu.service.js';
import { AuthController } from './auth/auth.controller.js';
import { GithubOAuthService } from './auth/github-oauth.service.js';
import { CONFIG, lireConfig, type Config } from './config.js';
import { DiagnosticController } from './diagnostic/diagnostic.controller.js';
import { GithubService } from './github/github.service.js';
import { ModeleUtilisateurController } from './modele-utilisateur/modele-utilisateur.controller.js';
import { StoreModeleUtilisateur } from './modele-utilisateur/modele-utilisateur.js';
import { ProjetsController } from './projets/projets.controller.js';
import { IndicateursController } from './indicateurs/indicateurs.controller.js';
import { IndicateursService } from './indicateurs/indicateurs.service.js';
import { RegistreService } from './indicateurs/registre.service.js';
import { DemoController } from './demo/demo.controller.js';
import { DemoService } from './demo/demo.service.js';
import { ProjetsService } from './projets/projets.service.js';
import { ProtectionController } from './projets/protection.controller.js';
import { RepriseService } from './projets/reprise.service.js';
import { RepriseController } from './projets/reprise.controller.js';
import { StoriesController } from './stories/stories.controller.js';
import { DemandesStore } from './stories/demandes.js';
import { StoriesService } from './stories/stories.service.js';
import { VerificationController } from './verification/verification.controller.js';
import { VerificationService } from './verification/verification.service.js';
import { VersionController } from './version/version.controller.js';
import { VersionsController } from './versions/versions.controller.js';
import { VersionsService } from './versions/versions.service.js';

@Module({
  controllers: [AgentController, ModeleUtilisateurController, DemoController, EmpreinteProjetController, IndicateursController, ApercuController, AuthController, DiagnosticController, ProjetsController, ProtectionController, RepriseController, StoriesController, VerificationController, VersionController, VersionsController],
  providers: [
    { provide: CONFIG, useFactory: () => lireConfig() },
    { provide: StoreModeleUtilisateur, useFactory: (config: Config) => new StoreModeleUtilisateur(config.DOSSIER_MODELES, config.SESSION_SECRET), inject: [CONFIG] },
    AgentService,
    ApercuService,
    DemoService,
    GithubService,
    GithubOAuthService,
    IndicateursService,
    RegistreService,
    ProjetsService,
    RepriseService,
    DemandesStore,
    StoriesService,
    VerificationService,
    VersionsService,
  ],
})
export class AppModule {}
