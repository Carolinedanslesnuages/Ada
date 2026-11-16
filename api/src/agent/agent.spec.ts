import { describe, it, expect } from 'vitest';
import {
  brancheDe,
  consigneAnalyse,
  consigneRealisation,
  decrireEvenement,
  lireDecision,
  lireResultat,
  OUTILS,
  type Demande,
} from './agent.js';

const demande: Demande = {
  numero: 1,
  titre: 'Page d’accueil « Ma journée »',
  type: 'story',
  contenu: { role: 'agent', besoin: 'voir ma journée', benefice: 'm’organiser', criteres: ['titre « Ma journée »', 'date du jour'] },
  contenuBug: null,
  echanges: [{ auteur: 'po', texte: 'La date en toutes lettres.' }],
};

describe('Consignes données à l’agent', () => {
  it('l’analyse est en lecture seule et demande une réponse JSON', () => {
    expect(OUTILS.analyse).toEqual(['Read', 'Glob', 'Grep']);
    const consigne = consigneAnalyse(demande);
    expect(consigne).toContain('PHASE : ANALYSE (lecture seule');
    expect(consigne).toContain('- titre « Ma journée »');
    expect(consigne).toContain('[PO] La date en toutes lettres.');
    expect(consigne).toContain('{"decision":"questions"');
  });

  it('la réalisation n’autorise ni push ni commande hors du conteneur', () => {
    expect(OUTILS.realisation.some((o) => o.includes('push'))).toBe(false);
    expect(OUTILS.realisation.filter((o) => o.startsWith('Bash(')).every((o) => /^Bash\((docker compose -f \.\.\/compose\.yml exec|git (status|diff|add|commit|log))/.test(o))).toBe(true);
    const consigne = consigneRealisation(demande, 'story/1-page-d-accueil-ma-journee');
    expect(consigne).toContain('Closes #1');
    expect(consigne).toContain('Ne pousse pas');
    expect(consigne).toContain('revues/story-1-page-d-accueil-ma-journee.md');
  });

  it('nomme la branche d’après le numéro et le titre', () => {
    expect(brancheDe(demande)).toBe('story/1-page-d-accueil-ma-journee');
    expect(brancheDe({ numero: 4, titre: 'Liste vide !', type: 'bug' })).toBe('fix/4-liste-vide');
  });
});

describe('Lecture des réponses de l’agent', () => {
  it('lit une décision, même entourée de texte ou de ```json', () => {
    expect(lireDecision('Voici :\n```json\n{"decision":"plan","texte":"Je vais…"}\n```')).toEqual({ decision: 'plan', texte: 'Je vais…' });
    expect(lireDecision('{"decision":"questions","texte":"1. Quel format ?"}')?.decision).toBe('questions');
  });

  it('refuse une réponse inexploitable', () => {
    expect(lireDecision('Je ne sais pas')).toBeNull();
    expect(lireDecision('{"decision":"autre","texte":"x"}')).toBeNull();
    expect(lireDecision('{"decision":"plan","texte":"  "}')).toBeNull();
  });

  it('lit le résultat de la réalisation', () => {
    expect(lireResultat('{"resultat":"ok","resume":"La page affiche…"}')).toEqual({ resultat: 'ok', resume: 'La page affiche…' });
    expect(lireResultat('{"resultat":"bloque","raison":"Tests rouges"}')).toEqual({ resultat: 'bloque', raison: 'Tests rouges' });
    expect(lireResultat('{"resultat":"ok"}')).toBeNull();
  });
});

describe('Fil d’activité pour le PO', () => {
  const evt = (name: string, input: Record<string, unknown>) =>
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

  it('traduit les actions de l’agent en phrases simples', () => {
    expect(decrireEvenement(evt('Read', { file_path: '/x/front/src/App.vue' }))).toEqual(['Lit src/App.vue']);
    expect(decrireEvenement(evt('Edit', { file_path: '/x/front/src/views/HomeView.vue' }))).toEqual(['Modifie views/HomeView.vue']);
    expect(decrireEvenement(evt('Bash', { command: 'docker compose -f ../compose.yml exec -T -u node app bash -lc "cd /app/front && npx vitest run"' }))).toEqual(['Lance les tests']);
    expect(decrireEvenement(evt('Bash', { command: 'git commit -m "feat: x"' }))).toEqual(['Enregistre le travail (commit)']);
  });

  it('ignore ce qui n’est pas une action', () => {
    expect(decrireEvenement(JSON.stringify({ type: 'system', subtype: 'init' }))).toEqual([]);
    expect(decrireEvenement('pas du json')).toEqual([]);
  });
});
