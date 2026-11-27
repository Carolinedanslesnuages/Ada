import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { footprint, type Footprint, type ModelUsage } from './footprint.js';
import { parseStored } from '../legacy/legacy-storage.js';

/**
 * Raw log of model usage (one JSON object per line, outside git, in the registry
 * folder): only tokens per model, never content. The API and the workers each
 * append their lines to it.
 */
export interface FootprintEntry {
  at: string;
  project: string;
  number: number;
  phase: string;
  /**
   * Resumed agent session (conversation): Claude reports the SESSION TOTAL at each
   * turn, not the usage of the turn. The raw reading is kept; the computation only retains the difference.
   */
  session?: string | null;
  usages: ModelUsage[];
}

const file = (registryFolder: string) => join(resolve(registryFolder), 'empreinte.jsonl');

export async function recordFootprint(registryFolder: string, entry: FootprintEntry): Promise<void> {
  if (!entry.usages.length) return;
  await mkdir(resolve(registryFolder), { recursive: true });
  await appendFile(file(registryFolder), `${JSON.stringify(entry)}\n`);
}

export async function readFootprints(registryFolder: string): Promise<FootprintEntry[]> {
  const text = await readFile(file(registryFolder), 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [parseStored<FootprintEntry>(line)];
      } catch {
        return [];
      }
    });
}

/**
 * Usage specific to each entry: for a resumed session, the reading minus the previous one of the same
 * session (per model); otherwise the reading as is. The entries are read in log order.
 */
export function turnUsages(entries: FootprintEntry[]): ModelUsage[][] {
  const lastReadings = new Map<string, Map<string, ModelUsage>>();
  return entries.map((entry) => {
    if (!entry.session) return entry.usages;
    const previous = lastReadings.get(entry.session) ?? new Map<string, ModelUsage>();
    const turn = entry.usages.map((usage) => {
      const before = previous.get(usage.model);
      return {
        model: usage.model,
        inputTokenCount: Math.max(0, usage.inputTokenCount - (before?.inputTokenCount ?? 0)),
        outputTokenCount: Math.max(0, usage.outputTokenCount - (before?.outputTokenCount ?? 0)),
      };
    });
    lastReadings.set(entry.session, new Map(entry.usages.map((usage) => [usage.model, usage])));
    return turn;
  });
}

/**
 * Footprint of a set of entries (all, one project, one request). The session differences are
 * computed on the full log, then only the requested entries are kept.
 */
export function sumUp(entries: FootprintEntry[], keep: (entry: FootprintEntry) => boolean = () => true): Footprint {
  const turns = turnUsages(entries);
  return footprint(entries.flatMap((entry, rank) => (keep(entry) ? turns[rank]! : [])));
}
