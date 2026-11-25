import { BadRequestException, Body, Controller, Delete, Get, Inject, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConnecteGuard } from '../auth/connecte.guard.js';
import { CONFIG, type Config } from '../config.js';
import { StoreModeleUtilisateur, testerPasserelle, verifierModele, verifierResolution, versPublic, type ModeleUtilisateur, type ResultatTest } from './modele-utilisateur.js';

/** « Mon modèle » : le modèle de langage de l'utilisateur (adresse, clé, nom). La clé n'est jamais renvoyée. */
@Controller('modele')
@UseGuards(ConnecteGuard)
export class ModeleUtilisateurController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly store: StoreModeleUtilisateur,
  ) {}

  private login(req: Request): string {
    return req.session.utilisateur!.login;
  }

  /** Valide la saisie ; une clé laissée vide garde celle déjà enregistrée (si l'adresse n'a pas changé). */
  private async lireSaisie(req: Request, corps: unknown): Promise<ModeleUtilisateur> {
    const { valeur, erreurs } = verifierModele(corps);
    if (!valeur) throw new BadRequestException({ erreurs });
    const refus = await verifierResolution(new URL(valeur.adresse).hostname);
    if (refus) throw new BadRequestException({ erreurs: { adresse: refus } });
    const existant = await this.store.lire(this.login(req));
    // La clé enregistrée ne part que vers l'adresse pour laquelle elle a été donnée.
    const cle = valeur.cle ?? (existant && existant.adresse === valeur.adresse ? existant.cle : '');
    return { adresse: valeur.adresse, cle, modele: valeur.modele };
  }

  @Get()
  async lire(@Req() req: Request) {
    return { ...versPublic(await this.store.lire(this.login(req))), parDefaut: this.config.AGENT_MODELE || null };
  }

  @Put()
  async enregistrer(@Req() req: Request, @Body() corps: unknown) {
    const modele = await this.lireSaisie(req, corps);
    await this.store.enregistrer(this.login(req), modele);
    return { ...versPublic(modele), parDefaut: this.config.AGENT_MODELE || null };
  }

  @Delete()
  async retirer(@Req() req: Request) {
    await this.store.supprimer(this.login(req));
    return { ...versPublic(null), parDefaut: this.config.AGENT_MODELE || null };
  }

  /** Essaie la passerelle avec la saisie en cours (sans l'enregistrer). */
  @Post('tester')
  async tester(@Req() req: Request, @Body() corps: unknown): Promise<ResultatTest> {
    return testerPasserelle(await this.lireSaisie(req, corps));
  }
}
