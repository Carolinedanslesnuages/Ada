/**
 * Consignes données à l'agent de code, lecture de ses réponses et traduction de son activité
 * en phrases pour le PO. Fonctions pures : testées sans lancer d'agent.
 */
import type { ContenuBug, ContenuStory, TypeDemande } from '../stories/story.js';

export type Phase = 'analyse' | 'realisation';

export interface Demande {
  numero: number;
  titre: string;
  type: TypeDemande;
  contenu: ContenuStory | null;
  contenuBug: ContenuBug | null;
  /** Échanges depuis le lancement (questions, plan, réponses du PO), dans l'ordre. */
  echanges: { auteur: 'assistant' | 'po'; texte: string }[];
}

export type DecisionAnalyse = { decision: 'questions' | 'plan'; texte: string };
export type ResultatRealisation = { resultat: 'ok'; resume: string } | { resultat: 'bloque'; raison: string };

/** Commande pour exécuter une commande dans le conteneur de l'aperçu (depuis le dépôt cloné). */
export const DANS_CONTENEUR = 'docker compose -f ../compose.yml exec -T -u node app bash -lc';

/** Outils autorisés par phase : lecture seule pour l'analyse ; ni push ni commande hors conteneur. */
export const OUTILS: Record<Phase, string[]> = {
  analyse: ['Read', 'Glob', 'Grep'],
  realisation: [
    'Read',
    'Glob',
    'Grep',
    'Edit',
    'Write',
    `Bash(${DANS_CONTENEUR} *)`,
    'Bash(git status*)',
    'Bash(git diff*)',
    'Bash(git add *)',
    'Bash(git commit *)',
    'Bash(git log*)',
  ],
};

export function brancheDe(demande: Pick<Demande, 'numero' | 'titre' | 'type'>): string {
  const slug = demande.titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `${demande.type === 'bug' ? 'fix' : 'story'}/${demande.numero}-${slug || 'demande'}`;
}

function decrireDemande(d: Demande): string {
  const lignes = [`Demande #${d.numero} — « ${d.titre} »`];
  if (d.type === 'story' && d.contenu) {
    lignes.push(
      `En tant que : ${d.contenu.role}`,
      `Je veux : ${d.contenu.besoin}`,
      `Afin de : ${d.contenu.benefice}`,
      'Critères d’acceptation :',
      ...d.contenu.criteres.map((c) => `- ${c}`),
    );
  }
  if (d.type === 'bug' && d.contenuBug) {
    lignes.push(
      `Problème signalé — ce qui se passe : ${d.contenuBug.constate}`,
      `Ce qui devrait se passer : ${d.contenuBug.attendu}`,
      `Comment le reproduire : ${d.contenuBug.etapes}`,
      `Écran concerné : ${d.contenuBug.ecran || 'non précisé'}`,
    );
  }
  if (d.echanges.length) {
    lignes.push('', 'Échanges avec le PO depuis le lancement :');
    for (const e of d.echanges) lignes.push(`[${e.auteur === 'po' ? 'PO' : 'Assistant'}] ${e.texte}`);
  }
  return lignes.join('\n');
}

const COMMUN = `Tu travailles pour un Product Owner (PO) non développeur, dans le dépôt de son projet
(répertoire courant). Lis d'abord AGENTS.md et PROJET.md : ce sont les règles du projet.
Tu écris au PO en français, en langage métier, sans jargon, sans noms de fichiers.`;

export function consigneAnalyse(d: Demande): string {
  return `${COMMUN}

PHASE : ANALYSE (lecture seule — tu ne modifies rien).

${decrireDemande(d)}

Ta tâche :
1. Vérifie que la demande est claire et complète. Ne devine jamais une règle métier : s'il en
   manque une, pose au plus TROIS questions numérotées, courtes, que le PO peut trancher.
2. Sinon, propose un plan en langage métier, sans noms de fichiers, avec ces rubriques :
   « Ce qui va changer pour l'utilisateur », « Comment je vérifie chaque critère » (un test par
   critère), « Accessibilité » (points RGAA concernés), « Point d'attention » (données, etc.).
   Si une donnée est partagée entre plusieurs écrans, annonce l'usage d'un store Pinia.
3. Si le PO a déjà répondu à tes questions dans les échanges, tiens-en compte.

Ta réponse finale doit être UNIQUEMENT un objet JSON, sans texte autour :
{"decision":"questions","texte":"<tes questions>"}  ou  {"decision":"plan","texte":"<ton plan>"}`;
}

export function consigneRealisation(d: Demande, branche: string): string {
  return `${COMMUN}

PHASE : RÉALISATION. Le PO a validé le plan qui figure dans les échanges ci-dessous. Tu es sur la
branche ${branche}. L'application tourne dans un conteneur : le PO voit tes changements en direct.

${decrireDemande(d)}

Règles :
- Tests d'abord : au moins un test par critère d'acceptation, et pour chaque écran créé ou
  modifié un test d'accessibilité automatique (violationsAccessibilite, voir AGENTS.md).
- Toute commande (tests, lint, types, npm, prisma) s'exécute DANS LE CONTENEUR, par exemple :
  ${DANS_CONTENEUR} "cd /app/front && npx vitest run src/views"
  ${DANS_CONTENEUR} "cd /app/api && npx vitest run"
  Pendant le travail, ne lance que les tests concernés.
- Noms explicites partout : chaque variable, fonction, paramètre dit ce qu'il contient ou fait
  (« salleLibre », « reservationsDuJour »), jamais « el », « x », « s », « tmp » ; seuls les noms
  imposés par les bibliothèques restent tels quels (vi, expect…). Le lint le vérifie.
- Reste dans le périmètre de la demande : aucun « refactor au passage », aucune dépendance non
  nécessaire. Un autre problème repéré : note-le dans la fiche, ne le corrige pas.
- Contrôle final, une seule fois, en jugeant sur le code de retour de chaque commande :
  ${DANS_CONTENEUR} "cd /app/api && npm run lint && npm test && npm run test:e2e && npm run build"
  ${DANS_CONTENEUR} "cd /app/front && npx oxlint . && npx eslint . && npm run type-check && npm run test:unit -- --run && npm run build-only"
- Écris la fiche revues/${branche.replace('/', '-')}.md (critères et tests qui les prouvent,
  accessibilité dont ce qu'un humain doit vérifier, périmètre, résultat des contrôles), ajoute la
  demande à « Stories réalisées » de PROJET.md, puis commite au format Conventional Commits :
  « ${d.type === 'bug' ? 'fix' : 'feat'}: <ce que l'utilisateur peut désormais faire> » avec
  « Closes #${d.numero} » dans le corps. Ne pousse pas : l'atelier s'en charge.
- Trois échecs sur le même problème : arrête-toi.

Ta réponse finale doit être UNIQUEMENT un objet JSON, sans texte autour :
{"resultat":"ok","resume":"<3 ou 4 phrases pour le PO : ce qui a changé, comment le voir, ce qu'un humain doit encore vérifier>"}
ou {"resultat":"bloque","raison":"<ce qui bloque, simplement>"}`;
}

/** Extrait le dernier objet JSON d'une réponse (l'agent l'entoure parfois de ```json). */
export function lireJson<T>(texte: string): T | null {
  const nettoye = texte.replace(/```(?:json)?/g, '');
  const debut = nettoye.lastIndexOf('{"');
  if (debut < 0) return null;
  for (let fin = nettoye.length; fin > debut; fin = nettoye.lastIndexOf('}', fin - 1)) {
    try {
      return JSON.parse(nettoye.slice(debut, fin + 1)) as T;
    } catch {
      if (fin <= debut) break;
    }
  }
  return null;
}

export function lireDecision(texte: string): DecisionAnalyse | null {
  const r = lireJson<DecisionAnalyse>(texte);
  return r && (r.decision === 'questions' || r.decision === 'plan') && typeof r.texte === 'string' && r.texte.trim()
    ? r
    : null;
}

export function lireResultat(texte: string): ResultatRealisation | null {
  const r = lireJson<ResultatRealisation>(texte);
  if (r?.resultat === 'ok' && typeof r.resume === 'string') return r;
  if (r?.resultat === 'bloque' && typeof r.raison === 'string') return r;
  return null;
}

const court = (chemin: unknown) => String(chemin ?? '').split('/').slice(-2).join('/');

/** Traduit un événement stream-json de l'agent en phrases pour le fil d'activité. */
export function decrireEvenement(ligne: string): string[] {
  let evt: { type?: string; message?: { content?: { type?: string; name?: string; input?: Record<string, unknown> }[] } };
  try {
    evt = JSON.parse(ligne) as typeof evt;
  } catch {
    return [];
  }
  if (evt.type !== 'assistant') return [];
  return (evt.message?.content ?? [])
    .filter((c) => c.type === 'tool_use')
    .map((c) => {
      const entree = c.input ?? {};
      switch (c.name) {
        case 'Read':
          return `Lit ${court(entree.file_path)}`;
        case 'Edit':
        case 'Write':
          return `Modifie ${court(entree.file_path)}`;
        case 'Glob':
        case 'Grep':
          return 'Parcourt le projet';
        case 'Bash': {
          const commande = String(entree.command ?? '');
          if (/vitest|test:unit|npm test|test:e2e/.test(commande)) return 'Lance les tests';
          if (/lint|oxlint|eslint/.test(commande)) return 'Vérifie la qualité du code';
          if (/type-check|build/.test(commande)) return 'Vérifie que tout compile';
          if (/prisma/.test(commande)) return 'Met à jour la base de données';
          if (/npm (install|i) /.test(commande)) return 'Installe une dépendance';
          if (/git commit/.test(commande)) return 'Enregistre le travail (commit)';
          if (/^git /.test(commande)) return 'Consulte l’historique';
          return 'Exécute une commande';
        }
        default:
          return `Utilise ${c.name ?? 'un outil'}`;
      }
    });
}
