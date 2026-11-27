/** Agent activity (stream-json flow) translated into sentences for the PO's feed. */

const short = (filePath: unknown) => String(filePath ?? '').split('/').slice(-2).join('/');

/** Translates a stream-json event of the agent into sentences for the activity feed. */
export function describeEvent(line: string): string[] {
  let evt: { type?: string; message?: { content?: { type?: string; name?: string; input?: Record<string, unknown> }[] } };
  try {
    evt = JSON.parse(line) as typeof evt;
  } catch {
    return [];
  }
  if (evt.type !== 'assistant') return [];
  return (evt.message?.content ?? [])
    .filter((c) => c.type === 'tool_use')
    .map((c) => {
      const entry = c.input ?? {};
      switch (c.name) {
        case 'Read':
          return `Lit ${short(entry.file_path)}`;
        case 'Edit':
        case 'Write':
          return `Modifie ${short(entry.file_path)}`;
        case 'Glob':
        case 'Grep':
          return 'Parcourt le projet';
        case 'Skill':
          return `Applique la méthode « ${String(entry.skill ?? entry.name ?? 'skill')} »`;
        case 'Bash': {
          const command = String(entry.command ?? '');
          if (/vitest|test:unit|npm test|test:e2e/.test(command)) return 'Lance les tests';
          if (/lint|oxlint|eslint/.test(command)) return 'Vérifie la qualité du code';
          if (/type-check|build/.test(command)) return 'Vérifie que tout compile';
          if (/prisma/.test(command)) return 'Met à jour la base de données';
          if (/npm (install|i) /.test(command)) return 'Installe une dépendance';
          if (/git commit/.test(command)) return 'Enregistre le travail (commit)';
          if (/^git /.test(command)) return 'Consulte l’historique';
          return 'Exécute une commande';
        }
        default:
          return `Utilise ${c.name ?? 'un outil'}`;
      }
    });
}
