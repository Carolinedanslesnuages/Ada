import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { launchDetached } from './launch.js';

describe('worker launched outside the API process tree', () => {
  it('is not a descendant of the API: an API restart does not interrupt it', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'detache-'));
    const script = join(folder, 'worker.cjs');
    // The “worker” records its pid and its parent's, once the intermediate process has exited.
    writeFileSync(
      script,
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(join(folder, 'parent'))}, JSON.stringify({ pid: process.pid, parent: process.ppid, task: process.argv[2] })), 300);`,
    );
    const pid = await launchDetached(script, 'tache.json', join(folder, 'journal.log'));
    await new Promise((end) => setTimeout(end, 1000));
    const reading = JSON.parse(readFileSync(join(folder, 'parent'), 'utf8')) as { pid: number; parent: number; task: string };
    expect(reading.pid).toBe(pid);
    expect(reading.task).toBe('tache.json');
    expect(reading.parent).not.toBe(process.pid);
  });
});
