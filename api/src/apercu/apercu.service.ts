import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { CONFIG, type Config } from '../config.js';
import {
  attribuerPort,
  etatDepuisPs,
  genererCompose,
  NOM_DEPOT,
  SCRIPT_DEMARRAGE,
  VOLUME_CACHE_NPM,
  type EtatApercu,
} from './apercu.js';

export interface Apercu {
  etat: EtatApercu;
  url: string | null;
  /** Dernières lignes du journal du conteneur, utiles quand l'état est « erreur ». */
  journal: string | null;
}

export type Executer = (
  commande: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile);
const executerParDefaut: Executer = (commande, args, options) =>
  execFileAsync(commande, args, { ...options, maxBuffer: 10 * 1024 * 1024 });

@Injectable()
export class ApercuService {
  private readonly journal = new Logger(ApercuService.name);
  private readonly enPreparation = new Set<string>();
  executer: Executer = executerParDefaut;
  repond: (url: string) => Promise<boolean> = async (url) => {
    try {
      return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
    } catch {
      return false;
    }
  };

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  private get racine(): string {
    return resolve(this.config.DOSSIER_APERCUS);
  }

  private verifier(projet: string): void {
    if (!NOM_DEPOT.test(projet)) throw new BadRequestException('Nom de projet invalide');
  }

  private async ports(): Promise<Record<string, number>> {
    try {
      return JSON.parse(await readFile(join(this.racine, 'ports.json'), 'utf8')) as Record<string, number>;
    } catch {
      return {};
    }
  }

  private async port(projet: string): Promise<number> {
    const attribues = await this.ports();
    const port = attribuerPort(projet, attribues);
    if (attribues[projet] !== port) {
      await mkdir(this.racine, { recursive: true });
      await writeFile(join(this.racine, 'ports.json'), JSON.stringify({ ...attribues, [projet]: port }, null, 2));
    }
    return port;
  }

  async etat(projet: string): Promise<Apercu> {
    this.verifier(projet);
    const dossier = join(this.racine, projet);
    if (!existsSync(join(dossier, 'compose.yml'))) {
      return { etat: this.enPreparation.has(projet) ? 'demarrage' : 'arrete', url: null, journal: null };
    }
    const url = `http://localhost:${await this.port(projet)}`;
    const { stdout } = await this.executer('docker', ['compose', '-f', 'compose.yml', 'ps', '-a', '--format', 'json'], {
      cwd: dossier,
    });
    const etat = this.enPreparation.has(projet) ? 'demarrage' : etatDepuisPs(stdout, await this.repond(url));
    return { etat, url: etat === 'pret' ? url : null, journal: etat === 'pret' ? null : await this.dernieresLignes(dossier) };
  }

  /** Clone (ou met à jour) le dépôt avec les droits du PO, puis démarre les conteneurs. */
  async demarrer(jeton: string, projet: string): Promise<Apercu> {
    this.verifier(projet);
    if (this.enPreparation.has(projet)) return this.etat(projet);
    this.enPreparation.add(projet);
    const dossier = join(this.racine, projet);
    try {
      await mkdir(dossier, { recursive: true });
      // Le jeton passe par l'environnement : jamais dans la ligne de commande ni dans .git/config.
      const auth = Buffer.from(`x-access-token:${jeton}`).toString('base64');
      const env = {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`,
      };
      const depot = join(dossier, 'depot');
      if (existsSync(join(depot, '.git'))) {
        await this.executer('git', ['-C', depot, 'pull', '--ff-only', '--quiet'], { env });
      } else {
        const url = `https://github.com/${this.config.GITHUB_PROPRIETAIRE}/${projet}.git`;
        await this.executer('git', ['clone', '--quiet', url, depot], { env });
      }
      await writeFile(join(dossier, 'compose.yml'), genererCompose(projet, await this.port(projet)));
      await writeFile(join(dossier, 'demarrer.sh'), SCRIPT_DEMARRAGE, { mode: 0o755 });
      await this.executer('docker', ['volume', 'create', VOLUME_CACHE_NPM]);
      await this.executer('docker', ['compose', '-f', 'compose.yml', 'up', '-d', '--remove-orphans'], { cwd: dossier });
    } catch (e) {
      this.journal.warn(`Aperçu de ${projet} : ${(e as Error).message.split('\n')[0]}`);
      throw new BadRequestException('L’aperçu n’a pas pu démarrer. Réessayez ; si cela persiste, prévenez un développeur.');
    } finally {
      this.enPreparation.delete(projet);
    }
    return this.etat(projet);
  }

  private async dernieresLignes(dossier: string): Promise<string | null> {
    try {
      const { stdout } = await this.executer('docker', ['compose', '-f', 'compose.yml', 'logs', 'app', '--tail', '15', '--no-color'], {
        cwd: dossier,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
