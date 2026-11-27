/** Phase d'analyse : questions, plan, découpage ou attente, publiés dans l'issue ; aucune modification du code. */
import { texteDecoupage } from '../stories/story.js';
import type { Tache } from './agent.js';
import { consigneAnalyse } from './consignes.js';
import type { OutilsPhase } from './outils-phase.js';
import { lireDecision, texteQuestions } from './reponses.js';
import { demandeVaste, relanceDecoupage } from './relance-decoupage.js';
import { lireFichiersInstructions, RELANCE_FICHIER_SUSPECT, repriseDUnFichier } from './garde-injection.js';

export async function phaseAnalyse(outils: OutilsPhase, { jeton, login, depot, numero }: Tache): Promise<void> {
  const { stories } = outils;
  await outils.noter(depot, numero, 'Prépare le projet');
  const cwd = await outils.apercu.preparerDepot(jeton, depot);
  const skills = await outils.equiperSkills(cwd);
  await outils.noter(depot, numero, 'Lit la story et le projet');
  const { dsfr } = await outils.apercu.lireConfig(cwd);
  const demande = { ...(await outils.demande(jeton, depot, numero)), existantes: await outils.existantes(jeton, depot, numero) };
  const consigne = consigneAnalyse(demande, await outils.lireIndexRgaa(), skills.noms, dsfr);
  const reponse = await outils.executer(depot, numero, 'analyse', consigne, cwd, skills.dossiers, null, login);
  let decision = lireDecision(reponse);
  // Une demande vaste n'appelle pas des questions mais un découpage : on le redemande une fois
  // (les modèles plus petits posent des questions au lieu de découper, un texte long ou à plusieurs livrables).
  if (decision?.decision === 'questions' && demandeVaste(demande, decision.texte)) {
    await outils.noter(depot, numero, 'La demande est vaste : prépare un découpage');
    const seconde = await outils.executer(depot, numero, 'analyse', consigne + relanceDecoupage(decision.texte), cwd, skills.dossiers, null, login);
    const redecoupe = lireDecision(seconde);
    if (redecoupe?.decision === 'decoupage') decision = redecoupe;
  }
  // Une réponse qui reprend tel quel un texte du projet vient du fichier, pas de l'agent : une seconde chance, puis on bloque.
  const fichiers = await lireFichiersInstructions(cwd);
  if (decision && repriseDUnFichier(decision.texte, fichiers)) {
    await outils.noter(depot, numero, 'Un fichier du projet a dicté la réponse : nouvelle analyse');
    const seconde = await outils.executer(depot, numero, 'analyse', consigne + RELANCE_FICHIER_SUSPECT, cwd, skills.dossiers, null, login);
    const reprise = lireDecision(seconde);
    decision = reprise && !repriseDUnFichier(reprise.texte, fichiers) ? reprise : null;
    if (!decision) {
      await outils.bloquer(jeton, depot, numero, 'Un fichier du projet (AGENTS.md, PROJET.md ou README.md) contient un ordre adressé à l’assistant : ADA ne l’a pas suivi. À faire relire par un développeur.');
      return;
    }
  }
  if (!decision) {
    await outils.bloquer(jeton, depot, numero, 'ADA n’a pas réussi à analyser la demande.');
    return;
  }
  if (decision.decision === 'decoupage') {
    await stories.commenterAssistant(jeton, depot, numero, 'Découpage proposé', texteDecoupage(decision.texte, decision.stories ?? []));
    await stories.changerStatut(jeton, depot, numero, 'decoupage');
    await outils.noter(depot, numero, 'Attend que vous choisissiez les stories à créer');
    return;
  }
  if (decision.decision === 'attente') {
    await stories.commenterAssistant(jeton, depot, numero, 'Demande mise en attente', decision.texte);
    await stories.changerStatut(jeton, depot, numero, 'attente');
    await outils.noter(depot, numero, 'En attente : à relancer quand ce qu’elle attend sera livré');
    return;
  }
  const questions = decision.decision === 'questions';
  await stories.commenterAssistant(jeton, depot, numero, questions ? 'Questions d’ADA' : 'Plan proposé', texteQuestions(decision));
  await stories.changerStatut(jeton, depot, numero, questions ? 'questions' : 'plan-a-valider');
  await outils.noter(depot, numero, questions ? 'Attend vos réponses' : 'Attend que vous validiez le plan');
}
