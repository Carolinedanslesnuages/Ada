import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { lireConfig, loginAutorise } from './config.js';

const base = {
  GITHUB_PROPRIETAIRE: 'Proprio',
  GITHUB_CLIENT_ID: 'Iv-test',
  GITHUB_CLIENT_SECRET: 'secret',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('Configuration', () => {
  it('refuse de démarrer sans les identifiants de la GitHub App', () => {
    expect(() => lireConfig({ GITHUB_PROPRIETAIRE: 'p' })).toThrow(/GITHUB_CLIENT_ID/);
  });

  it('n’autorise par défaut que le propriétaire (compte personnel)', () => {
    const config = lireConfig(base);
    expect(loginAutorise(config, 'proprio')).toBe(true);
    expect(loginAutorise(config, 'inconnu')).toBe(false);
  });

  it('autorise exactement la liste fournie, sans tenir compte de la casse', () => {
    const config = lireConfig({ ...base, LOGINS_AUTORISES: 'po-un, PO-Deux' });
    expect(loginAutorise(config, 'po-deux')).toBe(true);
    expect(loginAutorise(config, 'proprio')).toBe(false);
  });

  it('livre par défaut les skills externes d’ADA (sous-modules), sans rien à configurer', () => {
    const config = lireConfig(base);
    expect(config.AGENT_SKILLS.map((chemin) => chemin.split('/').pop())).toEqual(['dsfr-skill', 'bug-investigate', 'repo-perimetre', 'controle-qualite-code']);
    // Les sous-modules doivent être récupérés (git clone --recurse-submodules) : sinon ADA tourne sans skills.
    for (const chemin of config.AGENT_SKILLS) expect(existsSync(resolve(process.cwd(), chemin, 'SKILL.md')), chemin).toBe(true);
  });

  it('AGENT_SKILLS vide explicitement : aucune skill', () => {
    expect(lireConfig({ ...base, AGENT_SKILLS: '' }).AGENT_SKILLS).toEqual([]);
  });

  it('AGENT_COMMANDE relatif : lu depuis interface/api, sans chemin propre à un poste', () => {
    expect(lireConfig({ ...base, AGENT_COMMANDE: './agent-openai/runner.mjs' }).AGENT_COMMANDE).toBe(`${process.cwd()}/agent-openai/runner.mjs`);
    expect(lireConfig({ ...base, AGENT_COMMANDE: 'claude' }).AGENT_COMMANDE).toBe('claude');
    expect(lireConfig({ ...base, AGENT_COMMANDE: '/usr/local/bin/claude' }).AGENT_COMMANDE).toBe('/usr/local/bin/claude');
  });
});
