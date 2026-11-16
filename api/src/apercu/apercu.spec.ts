import { describe, it, expect } from 'vitest';
import { attribuerPort, etatDepuisPs, genererCompose, NOM_DEPOT, PORT_MIN } from './apercu.js';

describe('Ports des aperçus', () => {
  it('garde le port déjà attribué à un projet', () => {
    expect(attribuerPort('poc-portail', { 'poc-portail': 5307 })).toBe(5307);
  });

  it('prend le premier port libre', () => {
    expect(attribuerPort('nouveau', { a: PORT_MIN, b: PORT_MIN + 1 })).toBe(PORT_MIN + 2);
  });

  it('refuse quand la plage est pleine', () => {
    const pleins = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`p${i}`, PORT_MIN + i]));
    expect(() => attribuerPort('encore', pleins)).toThrow(/Plus aucun port libre/);
  });
});

describe('Conteneurs d’un aperçu', () => {
  const compose = genererCompose('poc-portail', 5301);

  it('n’expose l’application que sur la machine, sur le port attribué', () => {
    expect(compose).toContain('"127.0.0.1:5301:5173"');
  });

  it('limite la mémoire et le processeur, et isole les dépendances dans des volumes', () => {
    expect(compose).toContain('mem_limit: 1536m');
    expect(compose).toContain('cpus: 1');
    expect(compose).toContain('modules_front:/app/front/node_modules');
    expect(compose).toContain('cache_npm:/home/node/.npm');
    expect(compose).toContain('name: atelier-po-cache-npm');
  });

  it('nomme le projet Docker d’après le dépôt', () => {
    expect(compose.startsWith('name: apercu-poc-portail\n')).toBe(true);
  });

  it('n’accepte que des noms de dépôt sûrs', () => {
    expect(NOM_DEPOT.test('poc-portail')).toBe(true);
    expect(NOM_DEPOT.test('../etc')).toBe(false);
    expect(NOM_DEPOT.test('a b')).toBe(false);
  });
});

describe('État d’un aperçu', () => {
  const ligne = (State: string) => JSON.stringify({ Service: 'app', State });

  it('arrêté sans conteneur', () => {
    expect(etatDepuisPs('', false)).toBe('arrete');
  });

  it('en démarrage tant que l’application ne répond pas, prêt ensuite', () => {
    expect(etatDepuisPs(ligne('running'), false)).toBe('demarrage');
    expect(etatDepuisPs(ligne('running'), true)).toBe('pret');
  });

  it('en erreur si le conteneur s’est arrêté', () => {
    expect(etatDepuisPs(`${JSON.stringify({ Service: 'db', State: 'running' })}\n${ligne('exited')}`, false)).toBe('erreur');
  });
});
