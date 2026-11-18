import { describe, it, expect } from 'vitest';
import {
  consigneSkills,
  brancheDe,
  consigneAnalyse,
  nettoyerChoix,
  texteQuestions,
  consigneRealisation,
  consigneConversation,
  cheminsReserves,
  lireReponseConversation,
  decrireEvenement,
  lireDecision,
  lireResultat,
  OUTILS_INTERDITS,
  outilsAutorises,
  skillSure,
  MISE_EN_FORME,
  type Demande,
} from './agent.js';
import { consigneReprise } from './consigne-reprise.js';

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
    expect(realisation.filter((o) => o.startsWith('Bash(')).every((o) => /^Bash\((docker compose -f \.\.\/compose\.yml exec|git (status|diff|add|rm|mv|commit|log))/.test(o))).toBe(true);
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
    expect(analyse).toContain('réponds par la décision « decoupage », sans plan');
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

  it('projet sans DSFR (repris) : ADA garde l’apparence du projet, l’accessibilité reste exigée', () => {
    for (const consigne of [consigneAnalyse(demande, null, [], false), consigneRealisation(demande, 'story/1-x', null, [], ['npm test'], false)]) {
      expect(consigne).toContain('n’utilise PAS le DSFR'.replace('’', "'"));
      expect(consigne).not.toContain('composants DSFR d’abord'.replace('’', "'"));
      expect(consigne).toContain('lang="fr"');
    }
    expect(consigneAnalyse(demande)).toContain("composants DSFR d'abord");
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
    expect(consigneSkills(['dsfr-skill', 'repo-perimetre'], false)).not.toContain('dsfr-skill');
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

describe('Questions à choix (réponse en cases à cocher, #35)', () => {
  const brut = (choix: unknown) => JSON.stringify({ decision: 'questions', texte: 'Deux questions.', choix });

  it('garde les choix bien formés, avec une seule ou plusieurs réponses', () => {
    const decision = lireDecision(
      brut([
        { question: 'Retour le jour même ?', choix: ['Oui', 'Non'] },
        { question: 'Quelles colonnes ?', choix: ['Nom', 'Date', 'Nom'], plusieurs: true },
      ]),
    );
    expect(decision?.choix).toEqual([
      { question: 'Retour le jour même ?', choix: ['Oui', 'Non'], plusieurs: false },
      { question: 'Quelles colonnes ?', choix: ['Nom', 'Date'], plusieurs: true },
    ]);
  });

  it('écarte les choix mal formés sans perdre les questions écrites', () => {
    const decision = lireDecision(brut([{ question: 'Une seule option ?', choix: ['Oui'] }, { choix: ['a', 'b'] }, 'texte']));
    expect(decision).toEqual({ decision: 'questions', texte: 'Deux questions.' });
    expect(lireDecision(JSON.stringify({ decision: 'plan', texte: 'Plan', choix: [{ question: 'Q', choix: ['a', 'b'] }] }))).toEqual({
      decision: 'plan',
      texte: 'Plan',
    });
    expect(nettoyerChoix(Array.from({ length: 5 }, (_, rang) => ({ question: `Q${rang}`, choix: ['a', 'b'] })))).toHaveLength(3);
  });

  it('écrit les choix lisibles sur GitHub, et les données pour ADA dans un commentaire caché', () => {
    const texte = texteQuestions({ decision: 'questions', texte: 'Questions.', choix: [{ question: 'Couleur -- vive ?', choix: ['Bleu', 'Rouge'], plusieurs: false }] });
    expect(texte).toContain('1. Couleur -- vive ? (une seule réponse)\n   - [ ] Bleu\n   - [ ] Rouge');
    const donnees = /<!-- ada:choix (\S+) -->/.exec(texte)![1]!;
    expect(donnees).not.toContain('--');
    expect(JSON.parse(Buffer.from(donnees, 'base64').toString('utf8'))).toEqual([{ question: 'Couleur -- vive ?', choix: ['Bleu', 'Rouge'], plusieurs: false }]);
    expect(texteQuestions({ decision: 'plan', texte: 'Le plan.' })).toBe('Le plan.');
  });

  it('la consigne d’analyse explique le format des choix', () => {
    expect(consigneAnalyse(demande)).toContain('"choix":[{"question"');
  });
});
});

describe('Décision « découpage » d’ADA (#36)', () => {
  const story = { titre: 'Voir', role: 'agent', besoin: 'voir', benefice: 'savoir', criteres: ['un critère'] };

  it('garde les stories proposées', () => {
    const decision = lireDecision(JSON.stringify({ decision: 'decoupage', texte: 'Trop gros.', stories: [story, { ...story, titre: 'Emprunter' }] }));
    expect(decision?.decision).toBe('decoupage');
    expect(decision?.stories).toHaveLength(2);
  });

  it('découpage inexploitable : l’explication devient des questions (comme avant)', () => {
    expect(lireDecision(JSON.stringify({ decision: 'decoupage', texte: 'Trop gros.', stories: [story] }))).toEqual({ decision: 'questions', texte: 'Trop gros.' });
  });

  it('la consigne demande un découpage en stories quand la demande est trop grosse', () => {
    expect(consigneAnalyse(demande)).toContain('réponds par la décision « decoupage »');
  });
});

describe('Supprimer ou renommer un fichier', () => {
  it('ADA peut supprimer ou renommer un fichier quand elle modifie le projet, jamais en analyse', () => {
    for (const phase of ['realisation', 'conversation'] as const) {
      expect(outilsAutorises(phase)).toEqual(expect.arrayContaining(['Bash(git rm *)', 'Bash(git mv *)']));
    }
    expect(outilsAutorises('analyse')).not.toContain('Bash(git rm *)');
    expect(consigneRealisation(demande, 'story/1-x')).toContain('« git rm <fichier> »');
  });
  it('repère les fichiers des dossiers réservés aux développeurs', () => {
    expect(cheminsReserves(['src/pages/Bientot.vue', '.github/workflows/ci.yml', 'charts/app/values.yaml', 'docs/github.md'])).toEqual([
      '.github/workflows/ci.yml',
      'charts/app/values.yaml',
    ]);
  });
});

describe('Conversation (« vrai prompt »)', () => {
  it('la consigne fait agir tout de suite, sans plan, et interdit de pousser ou fusionner', () => {
    const consigne = consigneConversation({ ...demande, type: 'conversation', contenu: null, contenuLibre: 'Mets le titre en bleu' }, 'conversation/1-titre');
    expect(consigne).toContain('PHASE : CONVERSATION');
    expect(consigne).toContain('fais-le TOUT DE SUITE, sans plan à valider');
    expect(consigne).toContain('Ne pousse pas, ne fusionne jamais');
    expect(consigne).toContain('Premier message du PO :\nMets le titre en bleu');
    expect(consigne).toContain(MISE_EN_FORME);
  });
  it('lit la réponse JSON, ou à défaut le texte brut', () => {
    expect(lireReponseConversation('{"reponse":"C’est fait."}')).toBe('C’est fait.');
    expect(lireReponseConversation('C’est fait, sans JSON.')).toBe('C’est fait, sans JSON.');
    expect(lireReponseConversation('{"autre":1}')).toBeNull();
    expect(lireReponseConversation('')).toBeNull();
  });
  it('branche à part, préfixée « conversation/ »', () => {
    expect(brancheDe({ numero: 9, titre: 'Conversation : mets le titre en bleu', type: 'conversation' })).toBe('conversation/9-mets-le-titre-en-bleu');
  });
});

describe('Consigne d’analyse : jamais de plan qui ne construit rien', () => {
  it('demande la décision « attente » quand rien ne peut être réalisé maintenant', () => {
    const consigne = consigneAnalyse(demande);
    expect(consigne).toContain('ne propose JAMAIS un plan qui ne\n   construit rien');
    expect(consigne).toContain('{"decision":"attente"');
  });
  it('lit la décision « attente »', () => {
    expect(lireDecision('{"decision":"attente","texte":"Attend #40."}')).toEqual({ decision: 'attente', texte: 'Attend #40.' });
  });
});

describe('Consigne d’analyse : pas de doublon avec les stories déjà écrites', () => {
  it('liste les autres stories du projet et interdit de les proposer à nouveau', () => {
    const consigne = consigneAnalyse({ ...demande, existantes: [{ numero: 31, titre: 'Envoyer les e-mails depuis le site', livree: false }, { numero: 5, titre: 'Prévisualiser', livree: true }] });
    expect(consigne).toContain('- #31 « Envoyer les e-mails depuis le site »');
    expect(consigne).toContain('- #5 « Prévisualiser » (livrée)');
    expect(consigne).toContain('ne propose JAMAIS une story déjà écrite');
    expect(consigne).toContain('si cette demande refait une story existante, ne planifie rien');
    expect(consigne).toContain('"doublonDe"');
  });
  it('dit quelle demande est découpée et d’où vient chaque story : jamais attendre son parent', () => {
    const consigne = consigneAnalyse({
      ...demande,
      parent: 30,
      existantes: [
        { numero: 30, titre: 'Service d’envoi', livree: false, decoupee: true },
        { numero: 41, titre: 'Bouton', livree: false, parent: 30 },
      ],
    });
    expect(consigne).toContain('Elle vient du découpage de la demande #30');
    expect(consigne).toContain('- #30 « Service d’envoi » (demande découpée : elle ne livre rien elle-même, elle attend ses stories)');
    expect(consigne).toContain('- #41 « Bouton » (issue du découpage de #30)');
    expect(consigne).toContain("N'attends JAMAIS une demande découpée");
  });
  it('sans autre story, pas de liste', () => {
    expect(consigneAnalyse(demande)).not.toContain('DÉJÀ écrits dans ce projet');
  });
  it('garde le numéro de la story recoupée, ignore une valeur invalide', () => {
    const story = { titre: 'Emprunter', role: 'agent', besoin: 'emprunter', benefice: 'éviter Excel', criteres: ['Bouton'] };
    const decision = lireDecision(JSON.stringify({ decision: 'decoupage', texte: 'Trop gros.', stories: [{ ...story, doublonDe: 31 }, { ...story, doublonDe: 'x' }] }));
    expect(decision?.stories?.[0]?.doublonDe).toBe(31);
    expect(decision?.stories?.[1]).not.toHaveProperty('doublonDe');
  });
});

describe('Consigne d’analyse : bref, décisions à cocher, découpage si la demande est floue', () => {
  it('demande d’être bref, impose les choix pour toute décision, et découpe une demande floue', () => {
    const consigne = consigneAnalyse(demande);
    expect(consigne).toContain('SOIS BREF');
    expect(consigne).toContain('Toute question qui appelle une DÉCISION doit avoir ses options');
    expect(consigne).toContain('ou trop floue : il te faudrait plus de trois questions');
  });
  it('retire le numéro que ADA ajoute à ses questions (ADA numérote elle-même)', () => {
    expect(nettoyerChoix([{ question: '2. Dans quel ordre ?', choix: ['A', 'B'] }])[0]!.question).toBe('Dans quel ordre ?')
  });

  it('chaque message au PO est aéré : phrases courtes, paragraphes séparés, listes (analyse, réalisation, reprise)', () => {
    expect(MISE_EN_FORME).toContain('phrases courtes');
    expect(MISE_EN_FORME).toContain('une ligne vide entre deux paragraphes');
    expect(MISE_EN_FORME).toContain('jamais de gros pavé');
    for (const consigne of [consigneAnalyse(demande), consigneRealisation(demande, 'story/1-x'), consigneReprise({ stack: null, dsfr: false })]) {
      expect(consigne).toContain(MISE_EN_FORME);
    }
  });

  it('rappelle qu’ada.json liste des dossiers, jamais des noms de paquets', () => {
    expect(consigneRealisation(demande, 'story/1-x')).toContain('jamais des noms de paquets');
  });

  it('se présente comme ADA, à la première personne (analyse, réalisation, reprise)', () => {
    for (const consigne of [consigneAnalyse(demande), consigneRealisation(demande, 'story/1-x'), consigneReprise({ stack: null, dsfr: false })]) {
      expect(consigne).toContain('Le PO te connaît sous le nom d\'ADA');
    }
  });
});
