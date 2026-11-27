import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { isSafeSkill } from './agent/tools.js';
import { readConfig, isLoginAllowed } from './config.js';

const base = {
  GITHUB_OWNER: 'Proprio',
  GITHUB_CLIENT_ID: 'Iv-test',
  GITHUB_CLIENT_SECRET: 'secret',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('Configuration', () => {
  it('refuses to start without the GitHub App credentials', () => {
    expect(() => readConfig({ GITHUB_OWNER: 'p' })).toThrow(/GITHUB_CLIENT_ID/);
  });

  it('allows only the owner by default (personal account)', () => {
    const config = readConfig(base);
    expect(isLoginAllowed(config, 'proprio')).toBe(true);
    expect(isLoginAllowed(config, 'unknown')).toBe(false);
  });

  it('allows exactly the given list, ignoring case', () => {
    const config = readConfig({ ...base, ALLOWED_LOGINS: 'po-un, PO-Deux' });
    expect(isLoginAllowed(config, 'po-deux')).toBe(true);
    expect(isLoginAllowed(config, 'proprio')).toBe(false);
  });

  it('ships ADA\'s external skills by default (submodules), with nothing to configure', () => {
    const config = readConfig(base);
    expect(config.AGENT_SKILLS.map((filePath) => filePath.split('/').pop())).toEqual([
      'dsfr-skill', 'bug-investigate', 'repo-perimetre', 'controle-qualite-code',
      'fabnum-code-style', 'fabnum-client', 'fabnum-server', 'fabnum-rest-api', 'fabnum-project-docs',
      'securite-developpement', 'rgaa',
    ]);
    // The submodules must be fetched (git clone --recurse-submodules): otherwise ADA runs without skills.
    for (const filePath of config.AGENT_SKILLS) expect(existsSync(resolve(process.cwd(), filePath, 'SKILL.md')), filePath).toBe(true);
  });

  it('no skill shipped by default pre-authorizes a tool or runs a command when loaded', () => {
    for (const filePath of readConfig(base).AGENT_SKILLS) {
      expect(isSafeSkill(readFileSync(resolve(process.cwd(), filePath, 'SKILL.md'), 'utf8')), filePath).toBe(true);
    }
  });

  it('AGENT_SKILLS explicitly empty: no skill', () => {
    expect(readConfig({ ...base, AGENT_SKILLS: '' }).AGENT_SKILLS).toEqual([]);
  });

  it('relative AGENT_COMMAND: read from interface/api, without a machine-specific path', () => {
    expect(readConfig({ ...base, AGENT_COMMAND: './agent-openai/runner.mjs' }).AGENT_COMMAND).toBe(`${process.cwd()}/agent-openai/runner.mjs`);
    expect(readConfig({ ...base, AGENT_COMMAND: 'claude' }).AGENT_COMMAND).toBe('claude');
    expect(readConfig({ ...base, AGENT_COMMAND: '/usr/local/bin/claude' }).AGENT_COMMAND).toBe('/usr/local/bin/claude');
  });
});
