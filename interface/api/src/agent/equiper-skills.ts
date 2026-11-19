import { existsSync } from 'node:fs';
import { appendFile, lstat, mkdir, readFile, realpath, symlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { dossierGitDe } from '../apercu/git-isole.js';
import { skillSure } from './outils.js';

/**
 * Relie les skills configurées dans le projet (.claude/skills pour Claude Code, .agents/skills
 * pour les autres agents), exclues localement de git : rien n'est commité, le dépôt reste propre.
 * Renvoie les noms des skills disponibles.
 */
export async function equiperSkills(cwd: string, skills: string[], avertir: (message: string) => void): Promise<{ noms: string[]; dossiers: string[] }> {
  const disponibles: string[] = [];
  for (const dossier of skills) {
    const contenu = await readFile(join(dossier, 'SKILL.md'), 'utf8').catch(() => null);
    if (contenu === null) continue;
    if (!skillSure(contenu)) {
      avertir(`Skill ${basename(dossier)} écartée : elle pré-autorise des outils ou exécute des commandes`);
      continue;
    }
    disponibles.push(dossier);
  }
  if (!disponibles.length) return { noms: [], dossiers: [] };
  // Le dossier git d'un aperçu est rangé à côté du dépôt (`.git` n'y est qu'un fichier de renvoi,
  // voir git-isole.ts) : c'est là que git lit ses exclusions locales.
  const dossierGit = dossierGitDe(cwd);
  const exclusion = join(dossierGit && existsSync(dossierGit) ? dossierGit : join(cwd, '.git'), 'info', 'exclude');
  const exclus = await readFile(exclusion, 'utf8').catch(() => '');
  const aAjouter = ['/.claude/skills/', '/.agents/skills/'].filter((motif) => !exclus.split('\n').includes(motif));
  if (aAjouter.length) {
    await mkdir(dirname(exclusion), { recursive: true });
    await appendFile(exclusion, `${exclus && !exclus.endsWith('\n') ? '\n' : ''}${aAjouter.join('\n')}\n`);
  }
  for (const racine of ['.claude/skills', '.agents/skills']) {
    await mkdir(join(cwd, racine), { recursive: true });
    for (const dossier of disponibles) {
      const lien = join(cwd, racine, basename(dossier));
      const existant = await lstat(lien).catch(() => null);
      if (!existant) await symlink(resolve(dossier), lien);
    }
  }
  return {
    noms: disponibles.map((dossier) => basename(dossier)),
    // Chemins réels : l'agent lit la skill via le lien, mais la permission porte sur la cible.
    dossiers: await Promise.all(disponibles.map((dossier) => realpath(dossier))),
  };
}
