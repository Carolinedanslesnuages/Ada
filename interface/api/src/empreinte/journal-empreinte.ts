import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { empreinte, type Empreinte, type UsageModele } from './empreinte.js';

/**
 * Journal brut de l'usage des modèles (un objet JSON par ligne, hors git, dans le dossier du
 * registre) : seulement des tokens par modèle, jamais de contenu. L'API et les travailleurs y
 * ajoutent chacun leurs lignes.
 */
export interface EntreeEmpreinte {
  le: string;
  projet: string;
  numero: number;
  phase: string;
  usages: UsageModele[];
}

const fichier = (dossierRegistre: string) => join(resolve(dossierRegistre), 'empreinte.jsonl');

export async function noterEmpreinte(dossierRegistre: string, entree: EntreeEmpreinte): Promise<void> {
  if (!entree.usages.length) return;
  await mkdir(resolve(dossierRegistre), { recursive: true });
  await appendFile(fichier(dossierRegistre), `${JSON.stringify(entree)}\n`);
}

export async function lireEmpreintes(dossierRegistre: string): Promise<EntreeEmpreinte[]> {
  const texte = await readFile(fichier(dossierRegistre), 'utf8').catch(() => '');
  return texte
    .split('\n')
    .filter(Boolean)
    .flatMap((ligne) => {
      try {
        return [JSON.parse(ligne) as EntreeEmpreinte];
      } catch {
        return [];
      }
    });
}

/** Empreinte d'un ensemble d'entrées (toutes, un projet, une demande). */
export function sommer(entrees: EntreeEmpreinte[]): Empreinte {
  return empreinte(entrees.flatMap((entree) => entree.usages));
}
