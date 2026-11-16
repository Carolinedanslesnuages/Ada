import { ADA_PAR_DEFAUT } from '../ada/ada-config.js';
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
  /** Mode sauvage : le prompt du PO. */
  contenuLibre: string | null;
  /** Échanges depuis le lancement (questions, plan, réponses du PO), dans l'ordre. */
  echanges: { auteur: 'assistant' | 'po'; texte: string }[];
}

export type DecisionAnalyse = { decision: 'questions' | 'plan'; texte: string };
export type ResultatRealisation = { resultat: 'ok'; resume: string } | { resultat: 'bloque'; raison: string };

/** Commande pour exécuter une commande dans le conteneur de l'aperçu (depuis le dépôt cloné). */
/** Commande dans l'aperçu, en utilisateur non privilégié (1000 : « node » ou « ada » selon l'image). */
export const DANS_CONTENEUR = 'docker compose -f ../compose.yml exec -T -u 1000 app bash -lc';

/**
 * Outils autorisés par phase, limités au projet (répertoire courant) : l'agent ne peut ni lire
 * ni écrire ailleurs sur le poste. Seuls les dossiers des skills sont lisibles en plus (chemins
 * réels, préfixe « // » = chemin absolu). Ni push, ni commande hors du conteneur.
 */
export function outilsAutorises(phase: Phase, dossiersLisibles: string[] = []): string[] {
  const lecture = ['Read(./**)', 'Glob(./**)', 'Grep(./**)', ...dossiersLisibles.map((dossier) => `Read(/${dossier}/**)`)];
  if (phase === 'analyse') return ['Skill', ...lecture];
  return [
    'Skill',
    ...lecture,
    'Edit(./**)',
    'Write(./**)',
    `Bash(${DANS_CONTENEUR} *)`,
    'Bash(git status*)',
    'Bash(git diff*)',
    'Bash(git add *)',
    'Bash(git commit *)',
    'Bash(git log*)',
  ];
}

/**
 * Interdits, quelle que soit la phase : l'agent ne touche jamais aux workflows GitHub (CI,
 * versions) qui contrôlent son propre travail. Une interdiction l'emporte sur une autorisation.
 */
/** Réservés aux développeurs : la CI et les versions (.github), le déploiement (charts). */
export const OUTILS_INTERDITS = ['Edit(./.github/**)', 'Write(./.github/**)', 'Edit(./charts/**)', 'Write(./charts/**)'];

/** Une skill qui pré-autorise des outils ou exécute des commandes au chargement casserait ce cloisonnement. */
export function skillSure(contenuSkill: string): boolean {
  const entete = contenuSkill.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return !/^allowed-tools:/m.test(entete) && !/!`/.test(contenuSkill);
}

export function brancheDe(demande: Pick<Demande, 'numero' | 'titre' | 'type'>): string {
  const slug = demande.titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  const prefixe = { bug: 'fix', libre: 'libre', story: 'story' }[demande.type];
  return `${prefixe}/${demande.numero}-${slug.replace(/^demande-libre-/, '') || 'demande'}`;
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
  if (d.type === 'libre' && d.contenuLibre) {
    lignes.push('Demande libre du PO (mode sauvage, hors story) :', d.contenuLibre);
  }
  if (d.echanges.length) {
    lignes.push('', 'Échanges avec le PO depuis le lancement :');
    for (const e of d.echanges) lignes.push(`[${e.auteur === 'po' ? 'PO' : 'Assistant'}] ${e.texte}`);
  }
  return lignes.join('\n');
}

/** Bases d'accessibilité (RGAA) appliquées à toute demande, même si AGENTS.md ne les contient pas. */
export const ACCESSIBILITE = `Accessibilité (RGAA, obligatoire) — toujours, à chaque écran ou composant :
- composants DSFR d'abord, sans changer leurs couleurs ; jamais de bouton ou champ recodé à la main ;
- lang="fr", titre de page explicite, un seul h1, titres sans saut de niveau ;
- images : alternative qui dit l'information, ou alt="" si décorative ;
- formulaires : étiquette visible liée à chaque champ, champs obligatoires signalés, erreurs
  claires reliées au champ ;
- clavier : tout est utilisable au clavier, ordre logique, focus visible, aucun tabindex positif ;
  un élément cliquable est un bouton ou un lien ;
- liens et boutons à l'intitulé explicite ; nouvelle fenêtre annoncée ;
- jamais d'information par la couleur seule ; messages dynamiques annoncés (role="status") ;
- tableaux avec titre et en-têtes ; animations qui respectent prefers-reduced-motion.`;

/** Quand utiliser chaque skill connue ; les autres sont simplement listées. */
const USAGE_SKILLS: Record<string, string> = {
  'dsfr-skill': 'avant d’écrire ou de modifier un composant ou une page DSFR (version et balisage officiels ; en Vue, utiliser le composant vue-dsfr correspondant)',
  'bug-investigate': 'pour un problème signalé : hypothèses de cause, puis test qui reproduit le bug avant toute correction',
  'repo-perimetre': 'avant de livrer : vérifier que chaque modification sert la demande et retirer le hors-sujet',
  'controle-qualite-code': 'pour relire ton propre code avant le contrôle final',
  'adr-new': 'si tu prends une décision d’architecture (nouvelle dépendance, structure de données, etc.)',
};

export function consigneSkills(skills: string[]): string {
  if (!skills.length) return '';
  const lignes = skills.map((nom) => `- ${nom}${USAGE_SKILLS[nom] ? ` : ${USAGE_SKILLS[nom]}` : ''}`);
  return `

Skills disponibles (outil Skill) — utilise-les au bon moment plutôt que ta mémoire :
${lignes.join('\n')}`;
}

/** Référentiel complet : l'index (106 critères) est joint ; le détail est dans le projet s'il existe. */
function referentielRgaa(index: string | null): string {
  if (!index) return '';
  return `

Référentiel RGAA complet (DINUM) — tu dois respecter TOUS ces critères. Pour les tests détaillés
d'un thème, ouvre docs/accessibilite/rgaa-4.1.2/<thème>.md dans le projet s'il existe.

${index}`;
}

const COMMUN = `Tu travailles pour un Product Owner (PO) non développeur, dans le dépôt de son projet
(répertoire courant). Lis d'abord AGENTS.md et PROJET.md : ce sont les règles du projet.
Tu écris au PO en français, en langage métier, sans jargon, sans noms de fichiers.

${ACCESSIBILITE}`;

export function consigneAnalyse(d: Demande, indexRgaa: string | null = null, skills: string[] = []): string {
  return `${COMMUN}${consigneSkills(skills)}${referentielRgaa(indexRgaa)}

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
4. Taille : une demande doit rester petite (un écran ou un parcours, une évolution des données au
   plus). Si elle est trop grosse — à plus forte raison une application entière ou plusieurs
   fonctionnalités — ne propose PAS de plan : réponds par des questions qui proposent de la découper
   en petites demandes successives (ou en user stories), en suggérant par quoi commencer.

Ta réponse finale doit être UNIQUEMENT un objet JSON, sans texte autour :
{"decision":"questions","texte":"<tes questions>"}  ou  {"decision":"plan","texte":"<ton plan>"}`;
}

export function consigneRealisation(
  d: Demande,
  branche: string,
  indexRgaa: string | null = null,
  skills: string[] = [],
  controles: string[] = ADA_PAR_DEFAUT.controles,
): string {
  return `${COMMUN}${consigneSkills(skills)}${referentielRgaa(indexRgaa)}

PHASE : RÉALISATION. Le PO a validé le plan qui figure dans les échanges ci-dessous. Tu es sur la
branche ${branche}. L'application tourne dans un conteneur : le PO voit tes changements en direct.

${decrireDemande(d)}

Règles :
- Tests d'abord : au moins un test par critère d'acceptation, et pour chaque écran créé ou
  modifié un test d'accessibilité automatique (violationsAccessibilite, voir AGENTS.md).
- Toute commande (tests, lint, types, npm, migrations) s'exécute DANS LE CONTENEUR, par exemple :
  ${DANS_CONTENEUR} "cd /app/<dossier> && npx vitest run <fichier de test>"
  (dossiers et commandes du projet : section « Commandes » d'AGENTS.md). Pendant le travail, ne
  lance que les tests concernés.
- Noms explicites partout : chaque variable, fonction, paramètre dit ce qu'il contient ou fait
  (« salleLibre », « reservationsDuJour »), jamais « el », « x », « s », « tmp » ; seuls les noms
  imposés par les bibliothèques restent tels quels (vi, expect…). Le lint le vérifie.
- Ne modifie jamais les dossiers .github/ (CI, versions) et charts/ (déploiement) : ils sont réservés aux développeurs. Si la
  demande l'exige, arrête-toi et réponds « bloque » en expliquant pourquoi.
- Reste dans le périmètre de la demande : aucun « refactor au passage », aucune dépendance non
  nécessaire. Un autre problème repéré : note-le dans la fiche, ne le corrige pas.
- Contrôle final, une seule fois, en jugeant sur le code de retour de chaque commande :
${controles.map((commande) => `  ${DANS_CONTENEUR} ${JSON.stringify(commande)}`).join('\n')}
- Écris la fiche revues/${branche.replace('/', '-')}.md${d.type === 'libre' ? ' (en tête : « Réalisé hors story, en mode libre »)' : ''} (critères et tests qui les prouvent,
  accessibilité dont ce qu'un humain doit vérifier, périmètre, résultat des contrôles), ajoute la
  demande à « Stories réalisées » de PROJET.md, puis commite au format Conventional Commits :
  « ${d.type === 'bug' ? 'fix' : 'feat'}: <ce que l'utilisateur peut désormais faire> »${d.type === 'libre' ? ' (ou « fix: » si la demande corrige quelque chose)' : ''} avec
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
        case 'Skill':
          return `Applique la méthode « ${String(entree.skill ?? entree.name ?? 'skill')} »`;
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
