/** Process launching: the coding agent, and the detached worker that outlives the API. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import { agentEnvironment } from '../preview/isolated-git.js';

/** Atomic write: a half-written file is never read (temporary file then rename). */
export async function writeAtomically(filePath: string, content: string): Promise<void> {
  // Unique name even for two writes within the same millisecond (several agent events at once).
  const temporary = `${filePath}.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, filePath);
}

/**
 * Launches the worker through an intermediate process that exits at once (“double launch”): the
 * worker is no longer a descendant of the API. An API restart (update, development mode
 * that stops the whole process tree) therefore does not interrupt it. Returns its pid.
 */
export async function launchDetached(script: string, taskFile: string, logFile: string): Promise<number> {
  const intermediate = `
    const { spawn } = require('node:child_process');
    const { openSync } = require('node:fs');
    const logOutput = openSync(process.argv[3], 'a');
    const worker = spawn(process.execPath, [process.argv[1], process.argv[2]], { detached: true, stdio: ['ignore', logOutput, logOutput] });
    worker.unref();
    process.stdout.write(String(worker.pid));`;
  return new Promise((ok, ko) => {
    let pid = '';
    const launcher = spawn(process.execPath, ['-e', intermediate, script, taskFile, logFile], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'] });
    launcher.stdout.on('data', (piece: Buffer) => (pid += piece.toString()));
    launcher.on('error', ko);
    launcher.on('close', (code) => (code === 0 && Number(pid) > 0 ? ok(Number(pid)) : ko(new Error(`Le travailleur n’a pas pu démarrer (code ${code})`))));
  });
}

/** Launches the agent; calls onLine for each line of its output; returns the exit code. */
export type AgentLauncher = (args: string[], cwd: string, onLine: (line: string) => void) => Promise<number>;

export const defaultLaunch =
  (command: string, environment: Record<string, string> = {}): AgentLauncher =>
  (args, cwd, onLine) =>
    new Promise((ok, ko) => {
      // Without the server secrets, and with git locked on the working repository (see isolated-git.ts).
      const processes = spawn(command, args, { cwd, env: agentEnvironment({ ...process.env, ...environment }, cwd), stdio: ['ignore', 'pipe', 'pipe'] });
      let rest = '';
      processes.stdout.on('data', (piece: Buffer) => {
        const lines = (rest + piece.toString('utf8')).split('\n');
        rest = lines.pop() ?? '';
        lines.filter(Boolean).forEach(onLine);
      });
      processes.on('error', ko);
      processes.on('close', (code) => {
        if (rest) onLine(rest);
        ok(code ?? 1);
      });
    });

/** Model chosen in the configuration (AGENT_MODEL); otherwise the one of the agent's account. */
export function modelOption(model: string | undefined | null): string[] {
  return model ? ['--model', model] : [];
}
