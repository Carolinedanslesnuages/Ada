import { describe, it, expect } from 'vitest';
import {
  consigneSkills,
  brancheDe,
  consigneAnalyse,
  consigneRealisation,
  decrireEvenement,
  lireDecision,
  lireResultat,
  OUTILS_INTERDITS,
  outilsAutorises,
  skillSure,
  type Demande,
} from './agent.js';

const demande: Demande = {
  numero: 1,
  titre: 'Page d’accueil « Ma journée »',
  type: 'story',
  contenu: { role: 'agent', besoin: 'voir ma journée', benefice: 'm’organiser', criteres: ['titre « Ma journée »', 'date du jour'] },
  contenuBug: null,
  contenuLibre: null,
  echanges: [{ auteur: 'po', texte: 'La date en toutes lettres.' }],
};

describe('Consignes données à l’agent', () => {
  it('l’analyse est en lecture seule et demande une réponse JSON', () => {
    expect(outilsAutorises('analyse')).toEqual(['Skill', 'Read(./**)', 'Glob(./**)', 'Grep(./**)']);
    const consigne = consigneAnalyse(demande);
    expect(consigne).toContain('PHASE : ANALYSE (lecture seule');
    expect(consigne).toContain('- titre « Ma journée »');
    expect(consigne).toContain('[PO] La date en toutes lettres.');
    expect(consigne).toContain('{"decision":"questions"');
    expect(consigne).toContain('Accessibilité (RGAA, obligatoire)');
  });

  it('la réalisation n’autorise ni push ni commande hors du conteneur', () => {
    const realisation = outilsAutorises('realisation');
    expect(realisation.some((o) => o.includes('push'))).toBe(false);
    expect(realisation.filter((o) => o.startsWith('Bash(')).every((o) => /^Bash\((docker compose -f \.\.\/compose\.yml exec|git (status|diff|add|commit|log))/.test(o))).toBe(true);
    const consigne = consigneRealisation(demande, 'story/1-page-d-accueil-ma-journee');
    expect(consigne).toContain('Closes #1');
    expect(consigne).toContain('Ne pousse pas');
    expect(consigne).toContain('Noms explicites partout');
    expect(consigne).toContain('focus visible, aucun tabindex positif');
    expect(consigne).toContain('revues/story-1-page-d-accueil-ma-journee.md');
  });

  it('mode sauvage : décrit le prompt et refuse de planifier une demande trop grosse', () => {
    const libre: Demande = { ...demande, type: 'libre', titre: 'Demande libre : Mets le titre en bleu', contenu: null, contenuLibre: 'Mets le titre en bleu', echanges: [] };
    const analyse = consigneAnalyse(libre);
    expect(analyse).toContain('Demande libre du PO (mode sauvage, hors story) :\nMets le titre en bleu');
    expect(analyse).toContain('une application entière');
    expect(analyse).toContain('ne propose PAS de plan');
    expect(brancheDe(libre)).toBe('libre/1-mets-le-titre-en-bleu');
    expect(consigneRealisation(libre, 'libre/1-mets-le-titre-en-bleu')).toContain('Réalisé hors story, en mode libre');
  });

  it('joint le référentiel RGAA complet quand il est fourni', () => {
    const index = '# RGAA 4.1.2 — les 106 critères\n- **11.1** Chaque champ de formulaire a-t-il une étiquette ?';
    for (const consigne of [consigneAnalyse(demande, index), consigneRealisation(demande, 'story/1-x', index)]) {
      expect(consigne).toContain('tu dois respecter TOUS ces critères');
      expect(consigne).toContain('**11.1** Chaque champ de formulaire a-t-il une étiquette ?');
      expect(consigne).toContain('docs/accessibilite/rgaa-4.1.2/');
    }
    expect(consigneAnalyse(demande)).not.toContain('Référentiel RGAA complet');
  });

  it('limite lecture et écriture au projet, plus la lecture des dossiers de skills', () => {
    const realisation = outilsAutorises('realisation', ['/Users/x/.local/share/dsfr-skill/skills/dsfr-skill']);
    expect(realisation).toContain('Edit(./**)');
    expect(realisation).toContain('Write(./**)');
    expect(realisation).toContain('Read(//Users/x/.local/share/dsfr-skill/skills/dsfr-skill/**)');
    expect(realisation).not.toContain('Read');
    expect(realisation).not.toContain('Edit');
    expect(realisation).not.toContain('Write');
  });

  it('interdit toujours de modifier les workflows GitHub et le chart de déploiement, et le dit dans la consigne', () => {
    expect(OUTILS_INTERDITS).toEqual(['Edit(./.github/**)', 'Write(./.github/**)', 'Edit(./charts/**)', 'Write(./charts/**)']);
    expect(consigneRealisation(demande, 'story/1-x')).toContain('Ne modifie jamais les dossiers .github/ (CI, versions) et charts/ (déploiement)');
  });

  it('écarte une skill qui pré-autorise des outils ou exécute des commandes', () => {
    expect(skillSure('---\nname: sure\ndescription: x\n---\nCorps')).toBe(true);
    expect(skillSure('---\nname: adr\nallowed-tools: Read Write\n---\nCorps')).toBe(false);
    expect(skillSure('---\nname: dyn\n---\n!`find . -name x`')).toBe(false);
  });

  it('indique à l’agent quand utiliser chaque skill disponible', () => {
    const texte = consigneSkills(['dsfr-skill', 'repo-perimetre', 'skill-inconnue']);
    expect(texte).toContain('- dsfr-skill : avant d’écrire ou de modifier un composant ou une page DSFR');
    expect(texte).toContain('- repo-perimetre : avant de livrer');
    expect(texte).toContain('- skill-inconnue');
    expect(consigneSkills([])).toBe('');
    expect(consigneRealisation(demande, 'story/1-x', null, ['bug-investigate'])).toContain('Skills disponibles (outil Skill)');
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

  it('montre au PO la méthode appliquée', () => {
    expect(decrireEvenement(evt('Skill', { skill: 'repo-perimetre' }))).toEqual(['Applique la méthode « repo-perimetre »']);
  });

  it('ignore ce qui n’est pas une action', () => {
    expect(decrireEvenement(JSON.stringify({ type: 'system', subtype: 'init' }))).toEqual([]);
    expect(decrireEvenement('pas du json')).toEqual([]);
  });
});
