import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_ADA, readAdaConfig } from '../ada/ada-config.js';
import { assignPort, NODE_FINGERPRINTS, stateFromPs, generateCompose, generateStartScript, generateWorkScript, REPOSITORY_NAME, nodeAdded, PORT_MIN, NODE_VERSION, NODE_VOLUME, sharedVolumes } from './preview.js';

describe('Preview ports', () => {
  it('keeps the port already assigned to a project', () => {
    expect(assignPort('poc-portail', { 'poc-portail': 5307 })).toBe(5307);
  });

  it('takes the first free port', () => {
    expect(assignPort('nouveau', { a: PORT_MIN, b: PORT_MIN + 1 })).toBe(PORT_MIN + 2);
  });

  it('refuses when the range is full', () => {
    const full = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`p${i}`, PORT_MIN + i]));
    expect(() => assignPort('encore', full)).toThrow(/Plus aucun port libre/);
  });
});

describe('Containers of a preview', () => {
  const compose = generateCompose('poc-portail', 5301);

  it('exposes the application only on the machine, on the assigned port', () => {
    expect(compose).toContain('"127.0.0.1:5301:5173"');
  });

  it('limits memory and CPU, and isolates the dependencies in volumes', () => {
    expect(compose).toContain('mem_limit: 1536m');
    expect(compose).toContain('cpus: 1');
    expect(compose).toContain('modules_1:/app/front/node_modules');
    expect(compose).toContain('cache_npm:/home/node/.npm');
    expect(compose).toContain('name: atelier-po-cache-npm');
  });

  it('by default (existing projects): PostgreSQL, API in the background, front in the foreground', () => {
    expect(compose).toContain('  db:\n    image: postgres:16');
    expect(compose).toContain('DATABASE_URL: postgresql://apercu:apercu@db:5432/apercu?schema=public');
    const work = generateWorkScript();
    expect(work).toContain('--fetch-retries=5');
    expect(work).toContain('(cd /app/api && installer)');
    expect(work).toContain('(cd /app/front && installer)');
    expect(work).toContain('(cd /app/api && npm run start:dev) > /tmp/arriere-plan-0.log 2>&1 &');
    expect(work).toContain('exec bash -c "cd /app/front && npx vite --host 0.0.0.0 --port 5173 --strictPort"');
    expect(generateStartScript()).toContain('chown node:node /app/api/node_modules /app/front/node_modules /home/node/.npm');
  });

  it('produces scripts that bash accepts (default and mockup)', () => {
    const folder = mkdtempSync(join(tmpdir(), 'scripts-'));
    const mockup = readAdaConfig(JSON.stringify({ type: 'mockup', requiredChecks: ['M'], checks: ['npm test'], preview: { npm: ['.'], main: "npx vite --base './'" } }));
    for (const [name, content] of Object.entries({
      'demarrer-defaut.sh': generateStartScript(),
      'travail-defaut.sh': generateWorkScript(),
      'demarrer-maquette.sh': generateStartScript(mockup),
      'travail-maquette.sh': generateWorkScript(mockup),
    })) {
      writeFileSync(join(folder, name), content);
      expect(() => execFileSync('bash', ['-n', join(folder, name)])).not.toThrow();
    }
  });

  it('a folder missing in ada.json (e.g. a package name instead of a folder) does not stop the preview', () => {
    // Real case: “pip": ["mini-racer"]” written by mistake; the preview crashed in a loop.
    const config = readAdaConfig(JSON.stringify({ type: 'traitement', requiredChecks: ['T'], checks: ['true'], preview: { image: 'python:3.13-slim', pip: ['mini-racer'], npm: ['absent'], main: 'true', port: 8000 } }));
    const work = generateWorkScript(config);
    expect(work).toContain('if [ -d /app/mini-racer ]; then (cd /app/mini-racer && installer_python);');
    expect(work).toContain('if [ -d /app/absent ]; then (cd /app/absent && installer);');
    // Real run of the installation lines (no /app folder here): the script goes on.
    const lines = work.split('\n').filter((line) => line.startsWith('if [ -d /app/'));
    const output = execFileSync('bash', ['-c', ['set -euo pipefail', ...lines, 'echo suite'].join('\n')], { encoding: 'utf8' });
    expect(output).toContain('dossier mini-racer absent : installation ignorée');
    expect(output).toContain('dossier absent absent : installation ignorée');
    expect(output.trim().endsWith('suite')).toBe(true);
  });

  it('mockup: neither database nor API, a single folder at the root', () => {
    const mockup = readAdaConfig(JSON.stringify({ type: 'mockup', requiredChecks: ['M'], checks: ['npm test'], preview: { npm: ['.'], main: "cd /app && npx vite --host 0.0.0.0 --port 5173 --strictPort --base './'" } }));
    const file = generateCompose('maquette', 5302, mockup);
    expect(file).not.toContain('postgres');
    expect(file).not.toContain('DATABASE_URL');
    expect(file).not.toContain('depends_on');
    expect(file).toContain('modules_0:/app/node_modules');
    // A command with apostrophes does not break the script (JSON string, separate file).
    expect(generateWorkScript(mockup)).toContain(`exec bash -c "cd /app && npx vite --host 0.0.0.0 --port 5173 --strictPort --base './'"`);
  });

  it('names the Docker project after the repository', () => {
    expect(compose.startsWith('name: apercu-poc-portail\n')).toBe(true);
  });

  it('accepts only safe repository names', () => {
    expect(REPOSITORY_NAME.test('poc-portail')).toBe(true);
    expect(REPOSITORY_NAME.test('../etc')).toBe(false);
    expect(REPOSITORY_NAME.test('a b')).toBe(false);
  });
});

describe('State of a preview', () => {
  const line = (State: string) => JSON.stringify({ Service: 'app', State });

  it('stopped without a container', () => {
    expect(stateFromPs('', false)).toBe('stopped');
  });

  it('starting while the application does not respond, ready afterwards', () => {
    expect(stateFromPs(line('running'), false)).toBe('starting');
    expect(stateFromPs(line('running'), true)).toBe('ready');
  });

  it('in error if the container stopped', () => {
    expect(stateFromPs(`${JSON.stringify({ Service: 'db', State: 'running' })}\n${line('exited')}`, false)).toBe('error');
  });

  describe('preview of a Python project', () => {
    const pythonConfig = readAdaConfig(
      JSON.stringify({
        type: 'api',
        requiredChecks: ['API'],
        checks: ['cd /app && pytest'],
        preview: { image: 'python:3.13-slim', base: 'postgres', pip: ['.'], main: 'cd /app && uvicorn app.main:app --host 0.0.0.0 --port 8000', port: 8000 },
      }),
    );

    it('virtual environment kept, shared pip cache, and the matching PATH', () => {
      const compose = generateCompose('api-python', 5310, pythonConfig);
      expect(compose).toContain('      - venv:/opt/venv');
      expect(compose).toContain('      - cache_pip:/home/ada/.cache/pip');
      expect(compose).toContain('      PATH: /opt/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin');
      expect(compose).toContain('    name: atelier-po-cache-pip');
      expect(compose).toContain('"127.0.0.1:5310:8000"');
      expect(sharedVolumes(pythonConfig)).toEqual(['atelier-po-cache-npm', 'atelier-po-cache-pip']);
      expect(sharedVolumes(DEFAULT_ADA)).toEqual(['atelier-po-cache-npm']);
    });

    it('creates the “ada” user (1000, like “node”) and works as that user, never as root', () => {
      const startup = generateStartScript(pythonConfig);
      expect(startup).toContain('useradd --create-home --uid 1000 --shell /bin/bash ada');
      expect(startup).toContain('chown ada:ada /home/node/.npm /opt/venv /home/ada/.cache/pip');
      expect(startup).toContain('exec runuser -u ada -- bash /travail.sh');
      // The assistant's commands (bash -l) find the tools of the virtual environment.
      expect(startup).toContain('/etc/profile.d/ada-venv.sh');
      expect(generateStartScript(DEFAULT_ADA)).not.toContain('ada-venv');
      expect(generateStartScript(DEFAULT_ADA)).toContain('exec runuser -u node -- bash /travail.sh');
      expect(generateStartScript(DEFAULT_ADA)).not.toContain('useradd');
    });

    it('installs the Python dependencies with retries, in the virtual environment', () => {
      const work = generateWorkScript(pythonConfig);
      expect(work).toContain('[ -x /opt/venv/bin/python ] || python3 -m venv /opt/venv');
      expect(work).toContain('fichier=requirements.txt; [ -f requirements-dev.txt ] && fichier=requirements-dev.txt');
      expect(work).toContain('pip install --retries 5 --timeout 60 -r "$fichier"');
      expect(work).toContain('(cd /app && installer_python)');
      expect(generateWorkScript(DEFAULT_ADA)).not.toContain('pip install');
    });

    it('generated scripts syntactically valid (bash -n)', () => {
      for (const script of [generateStartScript(pythonConfig), generateWorkScript(pythonConfig)]) {
        expect(() => execFileSync('bash', ['-n'], { input: script })).not.toThrow();
      }
    });
  });
});

describe('Node added to a Python image (Vue + FastAPI)', () => {
  const pythonAndVue = { ...DEFAULT_ADA, preview: { ...DEFAULT_ADA.preview, image: 'python:3.13-slim', npm: ['front'], pip: ['api'] } };

  it('only when the image has no Node and the project has npm dependencies', () => {
    expect(nodeAdded(pythonAndVue)).toBe(true);
    expect(nodeAdded(DEFAULT_ADA)).toBe(false);
    expect(nodeAdded({ ...pythonAndVue, preview: { ...pythonAndVue.preview, npm: [] } })).toBe(false);
  });

  it('pinned version, fingerprint checked before extraction, downloaded once into a shared volume', () => {
    const script = generateStartScript(pythonAndVue);
    expect(script).toContain(`node-v${NODE_VERSION}-linux-`);
    expect(script).toContain(NODE_FINGERPRINTS.x64);
    expect(script).toContain('if [ ! -x /opt/node/bin/node ]; then');
    expect(script.indexOf('hashlib.sha256')).toBeLessThan(script.indexOf('extractall'));
    expect(sharedVolumes(pythonAndVue)).toContain(NODE_VOLUME);
    const compose = generateCompose('poc', 5300, pythonAndVue);
    expect(compose).toContain('PATH: /opt/venv/bin:/opt/node/bin:');
    expect(compose).toContain('- node:/opt/node');
    expect(compose).toContain('npm_config_cache: /home/node/.npm');
  });

  it('a Node image stays unchanged', () => {
    expect(generateStartScript(DEFAULT_ADA)).not.toContain('/opt/node');
    expect(generateCompose('poc', 5300, DEFAULT_ADA)).not.toContain('/opt/node');
  });
});
