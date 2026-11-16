import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { lireConfig } from '../config.js';
import { ApercuService, type Executer } from './apercu.service.js';

const JETON = 'jeton-secret-du-po';

describe('ApercuService', () => {
  let racine: string;
  let service: ApercuService;
  let executer: ReturnType<typeof vi.fn<Executer>>;

  beforeEach(() => {
    racine = mkdtempSync(join(tmpdir(), 'apercus-'));
    service = new ApercuService(
      lireConfig({
        GITHUB_PROPRIETAIRE: 'proprio',
        GITHUB_CLIENT_ID: 'Iv',
        GITHUB_CLIENT_SECRET: 's',
        SESSION_SECRET: 'x'.repeat(32),
        DOSSIER_APERCUS: racine,
      }),
    );
    executer = vi.fn<Executer>(async (commande, args) => {
      if (commande === 'git' && args[0] === 'clone') mkdirSync(join(args[3]!, '.git'), { recursive: true });
      if (args.includes('ps')) return { stdout: JSON.stringify({ Service: 'app', State: 'running' }) };
      return { stdout: '' };
    });
    service.executer = executer;
    service.repond = async () => true;
  });

  it('clone le dépôt avec les droits du PO, sans jamais mettre le jeton dans les arguments', async () => {
    const apercu = await service.demarrer(JETON, 'poc-portail');
    const clone = executer.mock.calls.find(([c, a]) => c === 'git' && a[0] === 'clone')!;
    expect(clone[1]).toEqual(['clone', '--quiet', 'https://github.com/proprio/poc-portail.git', join(racine, 'poc-portail', 'depot')]);
    for (const [, args] of executer.mock.calls) expect(args.join(' ')).not.toContain(JETON);
    const entete = clone[2]!.env!.GIT_CONFIG_VALUE_0!;
    expect(Buffer.from(entete.replace('AUTHORIZATION: basic ', ''), 'base64').toString()).toBe(`x-access-token:${JETON}`);
    expect(apercu).toEqual({ etat: 'pret', url: 'http://localhost:5300', journal: null });
  });

  it('écrit les fichiers des conteneurs puis les démarre', async () => {
    await service.demarrer(JETON, 'poc-portail');
    expect(readFileSync(join(racine, 'poc-portail', 'compose.yml'), 'utf8')).toContain('"127.0.0.1:5300:5173"');
    expect(existsSync(join(racine, 'poc-portail', 'demarrer.sh'))).toBe(true);
    expect(executer).toHaveBeenCalledWith('docker', ['volume', 'create', 'atelier-po-cache-npm']);
    expect(executer).toHaveBeenCalledWith('docker', ['compose', '-f', 'compose.yml', 'up', '-d', '--remove-orphans'], {
      cwd: join(racine, 'poc-portail'),
    });
  });

  it('met à jour un dépôt déjà cloné au lieu de le recloner', async () => {
    await service.demarrer(JETON, 'poc-portail');
    executer.mockClear();
    await service.demarrer(JETON, 'poc-portail');
    expect(executer.mock.calls.some(([c, a]) => c === 'git' && a.includes('pull'))).toBe(true);
    expect(executer.mock.calls.some(([c, a]) => c === 'git' && a[0] === 'clone')).toBe(false);
  });

  it('donne un port différent à chaque projet, et le garde', async () => {
    await service.demarrer(JETON, 'poc-portail');
    const autre = await service.demarrer(JETON, 'annuaire');
    expect(autre.url).toBe('http://localhost:5301');
    expect((await service.demarrer(JETON, 'poc-portail')).url).toBe('http://localhost:5300');
  });

  it('est « arrêté » tant qu’il n’a jamais été démarré', async () => {
    expect(await service.etat('jamais-lance')).toEqual({ etat: 'arrete', url: null, journal: null });
  });

  it('reste « en démarrage » tant que l’application ne répond pas', async () => {
    service.repond = async () => false;
    const apercu = await service.demarrer(JETON, 'poc-portail');
    expect(apercu.etat).toBe('demarrage');
    expect(apercu.url).toBeNull();
  });

  it('refuse un nom de projet qui sortirait du dossier des aperçus', async () => {
    await expect(service.demarrer(JETON, '../etc')).rejects.toBeInstanceOf(BadRequestException);
    expect(executer).not.toHaveBeenCalled();
  });

  it('explique simplement un échec de démarrage, sans détail technique', async () => {
    executer.mockRejectedValueOnce(new Error('fatal: could not read from remote repository'));
    await expect(service.demarrer(JETON, 'poc-portail')).rejects.toThrow(/L’aperçu n’a pas pu démarrer/);
  });
});
