/** Versions of a project (release-please): reading the summary and publication rule. */

/** Only files a version PR is allowed to touch: no code, hence nothing to check. */
export const VERSION_FILES = ['CHANGELOG.md', 'version.txt', '.release-please-manifest.json'];
export const VERSION_BRANCH_PREFIX = 'release-please--';

export interface VersionItem {
  text: string;
  /** Number of the delivered issue (story or bug), if known. */
  workRequest: number | null;
}

export interface Summary {
  version: string | null;
  features: VersionItem[];
  fixes: VersionItem[];
  others: VersionItem[];
}

const SECTIONS: Record<string, keyof Omit<Summary, 'version'>> = {
  features: 'features',
  'bug fixes': 'fixes',
};

/** “chore(main): release 0.2.0” → “0.2.0”. */
export function versionFromTitle(title: string): string | null {
  return title.match(/release v?(\d+\.\d+\.\d+)/)?.[1] ?? null;
}

/** Turns the body of the release-please PR into a summary the PO can read. */
export function readSummary(title: string, body: string): Summary {
  const recap: Summary = { version: versionFromTitle(title), features: [], fixes: [], others: [] };
  let section: keyof Omit<Summary, 'version'> = 'others';
  for (const line of body.split('\n')) {
    const sectionTitle = line.match(/^###\s+(.+)$/);
    if (sectionTitle) {
      section = SECTIONS[sectionTitle[1]!.trim().toLowerCase()] ?? 'others';
      continue;
    }
    const element = line.match(/^\*\s+(.+)$/);
    if (!element) continue;
    const raw = element[1]!;
    const text = raw.replace(/\s*\(\[[^\]]*\]\([^)]*\)\).*$/, '').replace(/\*\*/g, '').trim();
    const workRequest = raw.match(/closes \[#(\d+)\]/i)?.[1];
    recap[section].push({ text, workRequest: workRequest ? Number(workRequest) : null });
  }
  return recap;
}

/** Publishable only if the PR only touches the version files. */
export function canPublish(files: string[]): { publishable: boolean; reason: string | null } {
  const others = files.filter((f) => !VERSION_FILES.includes(f));
  if (files.length === 0) return { publishable: false, reason: 'La version proposée est vide' };
  if (others.length) {
    return {
      publishable: false,
      reason: `La version proposée modifie aussi d’autres fichiers (${others.join(', ')}) : un développeur doit vérifier`,
    };
  }
  return { publishable: true, reason: null };
}
