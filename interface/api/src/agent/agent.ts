import { ADA_PAR_DEFAUT } from '../ada/ada-config.js';
/**
 * Consignes données à l'agent de code, lecture de ses réponses et traduction de son activité
 * en phrases pour le PO. Fonctions pures : testées sans lancer d'agent.
 */
import { nettoyerStoriesProposees, type ContenuBug, type ContenuStory, type StoryProposee, type TypeDemande } from '../stories/story.js';

/** « reprise » : analyse d'un projet existant repris par ADA (#37), en lecture seule. */
export type Phase = 'analyse' | 'realisation' | 'reprise' | 'conversation';

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
  /** Analyse : les autres stories du projet, pour ne jamais en proposer une deuxième fois. */
  existantes?: StoryExistante[];
  /** Demande découpée dont celle-ci est issue : elle se termine quand ses stories sont livrées. */
  parent?: number | null;
}

/** Une story ou un problème déjà écrit dans le projet (ouvert, ou livré). */
export interface StoryExistante {
  numero: number;
  titre: string;
  livree: boolean;
  /** Demande découpée dont elle est issue, s'il y en a une. */
  parent?: number | null;
  /** Vrai : demande découpée, qui ne livre rien elle-même (elle attend ses stories). */
  decoupee?: boolean;
}

/** Au plus 80 stories (les plus récentes) : de quoi repérer un doublon sans noyer la consigne. */
function decrireExistantes(existantes: StoryExistante[] = []): string {
  if (!existantes.length) return '';
  const lignes = existantes.slice(0, 80).map((s) => {
    const precisions = [
      s.livree && 'livrée',
      s.decoupee && 'demande découpée : elle ne livre rien elle-même, elle attend ses stories',
      s.parent && `issue du découpage de #${s.parent}`,
    ].filter(Boolean);
    return `- #${s.numero} « ${s.titre} »${precisions.length ? ` (${precisions.join(' ; ')})` : ''}`;
  });
  return `

Stories et problèmes DÉJÀ écrits dans ce projet (hors cette demande) :
${lignes.join('\n')}`;
}

/** Une question qui se tranche entre quelques options : le PO répond en cochant (#35). */
export interface QuestionAChoix {
  question: string;
  choix: string[];
  /** Vrai : plusieurs réponses possibles (cases à cocher) ; faux : une seule (boutons radio). */
  plusieurs: boolean;
}

export type DecisionAnalyse = {
  decision: 'questions' | 'plan' | 'decoupage' | 'attente';
  texte: string;
  choix?: QuestionAChoix[];
  /** Découpage : les stories proposées (le PO choisit lesquelles ADA crée, #36). */
  stories?: StoryProposee[];
};

/** Marque, dans le commentaire GitHub, les choix structurés lus par ADA (invisibles sur GitHub). */
export const MARQUEUR_CHOIX = 'ada:choix';
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
  if (phase === 'analyse' || phase === 'reprise') return ['Skill', ...lecture];
  return [
    'Skill',
    ...lecture,
    'Edit(./**)',
    'Write(./**)',
    `Bash(${DANS_CONTENEUR} *)`,
    'Bash(git status*)',
    'Bash(git diff*)',
    'Bash(git add *)',
    // Supprimer ou renommer un fichier du projet (une page retirée, par exemple) : git refuse tout
    // chemin hors du dépôt ; .github/ et charts/ restent protégés par cheminsReserves avant l'envoi.
    'Bash(git rm *)',
    'Bash(git mv *)',
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

/** Dossiers réservés aux développeurs (CI, versions, déploiement) : jamais modifiés par ADA. */
const DOSSIERS_RESERVES = ['.github/', 'charts/'];

/** Fichiers modifiés, ajoutés ou supprimés dans un dossier réservé : la branche ne doit pas partir. */
export function cheminsReserves(fichiers: string[]): string[] {
  return fichiers.filter((fichier) => DOSSIERS_RESERVES.some((dossier) => fichier.trim().startsWith(dossier)));
}

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
  const prefixe = { bug: 'fix', libre: 'libre', story: 'story', conversation: 'conversation' }[demande.type];
  return `${prefixe}/${demande.numero}-${slug.replace(/^(demande-libre|conversation)-/, '') || 'demande'}`;
}

function decrireDemande(d: Demande): string {
  const lignes = [`Demande #${d.numero} — « ${d.titre} »`];
  if (d.parent) {
    lignes.push(
      `Elle vient du découpage de la demande #${d.parent} : #${d.parent} ne se termine que quand toutes ses stories, dont celle-ci, sont livrées.`,
    );
  }
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
  if (d.type === 'conversation' && d.contenuLibre) {
    lignes.push('Premier message du PO :', d.contenuLibre);
  }
  if (d.echanges.length) {
    lignes.push('', 'Échanges avec le PO depuis le lancement :');
    for (const e of d.echanges) lignes.push(`[${e.auteur === 'po' ? 'PO' : 'Assistant'}] ${e.texte}`);
  }
  return lignes.join('\n');
}

/** Règle d'apparence : DSFR, ou design du projet (projet repris sans DSFR, ada.json « dsfr: false »). */
export function regleApparence(dsfr: boolean): string {
  return dsfr
    ? "- composants DSFR d'abord, sans changer leurs couleurs ; jamais de bouton ou champ recodé à la main ;"
    : "- ce projet n'utilise PAS le DSFR : garde son apparence et réutilise ses composants existants ;\n  n'ajoute ni DSFR ni autre bibliothèque d'interface ; jamais de bouton ou champ recodé s'il existe déjà ;";
}

/** Bases d'accessibilité (RGAA) appliquées à toute demande, même si AGENTS.md ne les contient pas. */
export const accessibilite = (dsfr = true) => `Accessibilité (RGAA, obligatoire) — toujours, à chaque écran ou composant :
${regleApparence(dsfr)}
- lang="fr", titre de page explicite, un seul h1, titres sans saut de niveau ;
- images : alternative qui dit l'information, ou alt="" si décorative ;
- formulaires : étiquette visible liée à chaque champ, champs obligatoires signalés, erreurs
  claires reliées au champ ;
- clavier : tout est utilisable au clavier, ordre logique, focus visible, aucun tabindex positif ;
  un élément cliquable est un bouton ou un lien ;
- liens et boutons à l'intitulé explicite ; nouvelle fenêtre annoncée ;
- jamais d'information par la couleur seule ; messages dynamiques annoncés (role="status") ;
- tableaux avec titre et en-têtes ; animations qui respectent prefers-reduced-motion.`;
export const ACCESSIBILITE = accessibilite();

/** Quand utiliser chaque skill connue ; les autres sont simplement listées. */
const USAGE_SKILLS: Record<string, string> = {
  'dsfr-skill': 'avant d’écrire ou de modifier un composant ou une page DSFR (version et balisage officiels ; en Vue, utiliser le composant vue-dsfr correspondant)',
  'bug-investigate': 'pour un problème signalé : hypothèses de cause, puis test qui reproduit le bug avant toute correction',
  'repo-perimetre': 'avant de livrer : vérifier que chaque modification sert la demande et retirer le hors-sujet',
  'controle-qualite-code': 'pour relire ton propre code avant le contrôle final',
  'adr-new': 'si tu prends une décision d’architecture (nouvelle dépendance, structure de données, etc.)',
};

export function consigneSkills(toutes: string[], dsfr = true): string {
  const skills = dsfr ? toutes : toutes.filter((nom) => nom !== 'dsfr-skill');
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

/** Mise en forme de tous les messages au PO : un gros pavé ne se lit pas. */
export const MISE_EN_FORME = `Mise en forme de CHACUN de tes messages au PO (il lit vite, souvent sur un petit écran) :
- phrases courtes : 20 mots au plus, une idée par phrase ;
- un paragraphe = une idée, trois phrases au plus ;
- une ligne vide entre deux paragraphes (dans un texte JSON : « \\n\\n ») ;
- une liste à puces dès que tu énumères (étapes, choix, points d'attention) ;
- l'essentiel en **gras**, avec parcimonie ;
- jamais de gros pavé.`;

const commun = (dsfr: boolean) => `Tu travailles pour un Product Owner (PO) non développeur, dans le dépôt de son projet
(répertoire courant). Lis d'abord AGENTS.md et PROJET.md s'ils existent : ce sont les règles du projet.
Tu écris au PO en français, en langage métier, sans jargon, sans noms de fichiers.
Le PO te connaît sous le nom d'ADA : parle de toi à la première personne (« je »), jamais de « l'assistant ».

${MISE_EN_FORME}

${accessibilite(dsfr)}`;

export function consigneAnalyse(d: Demande, indexRgaa: string | null = null, skills: string[] = [], dsfr = true): string {
  return `${commun(dsfr)}${consigneSkills(skills, dsfr)}${referentielRgaa(indexRgaa)}

PHASE : ANALYSE (lecture seule — tu ne modifies rien).

${decrireDemande(d)}${decrireExistantes(d.existantes)}

Ta tâche :
0. SOIS BREF : le PO doit pouvoir tout lire en une minute. Phrases courtes, aucune répétition,
   pas de détail technique ; un long pavé ne sera pas lu.
1. Vérifie que la demande est claire et complète. Ne devine jamais une règle métier : s'il en
   manque une, pose au plus TROIS questions numérotées, courtes, que le PO peut trancher.
   Toute question qui appelle une DÉCISION doit avoir ses options (2 à 6) dans « choix » : le PO
   décide en cochant (« plusieurs » vrai : cases à cocher ; faux : une seule réponse), avec une
   précision libre s'il le souhaite. Une question sans choix est l'exception (information que
   seul le PO connaît, sans options possibles).
2. Sinon, propose un plan court en langage métier, sans noms de fichiers, avec ces rubriques :
   « Ce qui va changer pour l'utilisateur », « Comment je vérifie chaque critère » (un test par
   critère), « Accessibilité » (points RGAA concernés), « Point d'attention » (données, etc.).
   Si une donnée est partagée entre plusieurs écrans, annonce l'usage d'un store Pinia.
3. Si le PO a déjà répondu à tes questions dans les échanges, tiens-en compte.
4. Découpage — réponds par la décision « decoupage », sans plan, quand la demande est :
   - trop grosse (plus d'un écran ou d'un parcours, plus d'une évolution des données, à plus forte
     raison une application entière ou plusieurs fonctionnalités) ;
   - ou trop floue : il te faudrait plus de trois questions pour la comprendre. Plutôt qu'une
     longue liste de questions, propose de petites stories précises, avec tes hypothèses écrites
     dans les critères : le PO les corrigera avant de les publier.
   Explique en une ou deux phrases pourquoi, et propose 2 à 8 stories courtes, dans l'ordre où les
   réaliser, chacune avec un titre, « en tant que » (role), « je veux » (besoin), « afin de »
   (benefice) et 1 à 4 critères d'acceptation vérifiables. Le PO relira, corrigera si besoin, et
   ADA les publiera sur GitHub pour lui.
5. Doublons — le PO est souvent pressé : il ne se souvient pas toujours de ce qu'il a déjà écrit.
   Compare avec les stories DÉJÀ écrites ci-dessus (même but pour l'utilisateur, même si les mots
   diffèrent) :
   - si cette demande refait une story existante, ne planifie rien : réponds par « questions »,
     cite-la (#numéro et titre) et demande au PO s'il veut poursuivre ici ou continuer celle-là ;
   - dans un découpage, ne propose JAMAIS une story déjà écrite : renvoie à elle dans ton
     explication (« déjà prévue : #numéro ») ; si une story proposée en recoupe une en partie,
     ajoute « doublonDe » : le numéro de celle qu'elle recoupe.
6. Attente — si la demande ne peut pas être réalisée MAINTENANT (elle dépend d'une story pas encore
   livrée, ou le PO a choisi de la garder pour plus tard), ne propose JAMAIS un plan qui ne
   construit rien : un plan validé doit livrer quelque chose. Réponds par la décision « attente » :
   dis ce qu'elle attend (#numéro si c'est une story), et reporte dans ton texte les critères
   réécrits s'il y en a, pour ne pas les perdre. ADA la garde ouverte ; le PO la relancera.
   N'attends JAMAIS une demande découpée, encore moins la demande parent de celle-ci : elle
   attend ses stories, donc celle-ci — ce serait une impasse. Vérifie d'abord dans le code du
   projet ce qui existe déjà, puis seulement dis qu'une pièce manque.

Ta réponse finale doit être UNIQUEMENT un objet JSON, sans texte autour :
{"decision":"questions","texte":"<tes questions>","choix":[{"question":"<question 1>","choix":["<option>","<option>"],"plusieurs":false}]}
ou {"decision":"plan","texte":"<ton plan>"}  (« choix » est facultatif)
ou {"decision":"attente","texte":"<ce qu'elle attend, et les critères réécrits s'il y en a>"}
ou {"decision":"decoupage","texte":"<pourquoi découper>","stories":[{"titre":"<titre court>","role":"<en tant que>","besoin":"<je veux>","benefice":"<afin de>","criteres":["<critère>"],"doublonDe":<numéro, seulement si elle recoupe une story existante>}]}`;
}

export function consigneRealisation(
  d: Demande,
  branche: string,
  indexRgaa: string | null = null,
  skills: string[] = [],
  controles: string[] = ADA_PAR_DEFAUT.controles,
  dsfr = true,
): string {
  return `${commun(dsfr)}${consigneSkills(skills, dsfr)}${referentielRgaa(indexRgaa)}

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
- ada.json décrit l'aperçu : dans « npm » et « pip », des DOSSIERS du projet (où se trouvent
  package.json ou requirements.txt), jamais des noms de paquets. Une dépendance s'ajoute dans
  package.json ou requirements.txt (requirements-dev.txt pour les outils de test).
- Noms explicites partout : chaque variable, fonction, paramètre dit ce qu'il contient ou fait
  (« salleLibre », « reservationsDuJour »), jamais « el », « x », « s », « tmp » ; seuls les noms
  imposés par les bibliothèques restent tels quels (vi, expect…). Le lint le vérifie.
- Pour supprimer ou renommer un fichier : « git rm <fichier> » ou « git mv <ancien> <nouveau> ».
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

/**
 * Conversation (« vrai prompt ») : le PO parle librement, ADA agit tout de suite sur une branche
 * à part, sans plan à valider. Rien n'arrive sur le projet avant que le PO dise « c'est bon » :
 * ADA ouvre alors la PR, contrôles verts obligatoires, et le PO fusionne.
 */
export function consigneConversation(
  d: Demande,
  branche: string,
  indexRgaa: string | null = null,
  skills: string[] = [],
  controles: string[] = ADA_PAR_DEFAUT.controles,
  dsfr = true,
): string {
  return `${commun(dsfr)}${consigneSkills(skills, dsfr)}${referentielRgaa(indexRgaa)}

PHASE : CONVERSATION. Le PO te parle librement, comme à une développeuse à côté de lui. Tu es sur
la branche ${branche}. L'application tourne dans un conteneur : le PO voit tes changements en direct.

${decrireDemande(d)}

Règles :
- Réponds à son DERNIER message, en tenant compte de toute la conversation.
- Il demande un changement : fais-le TOUT DE SUITE, sans plan à valider. Il pose une question :
  réponds, sans rien modifier. Une demande vraiment ambiguë, ou risquée (effacer des données,
  changer de stack, toucher à la sécurité) : demande-lui avant, en une question courte.
- Garde le projet sain : tests à jour pour ce que tu changes (accessibilité comprise), noms
  explicites, règles d'AGENTS.md. Toute commande s'exécute DANS LE CONTENEUR, par exemple :
  ${DANS_CONTENEUR} "cd /app/<dossier> && npx vitest run <fichier de test>"
- Après un changement de code, lance les contrôles et corrige ce que tu as cassé :
${controles.map((commande) => `  ${DANS_CONTENEUR} ${JSON.stringify(commande)}`).join('\n')}
- Enregistre chaque changement par un commit au format Conventional Commits (« feat: … »,
  « fix: … »). Ne pousse pas, ne fusionne jamais : l'atelier s'en charge quand le PO dit « c'est bon ».
- Pour supprimer ou renommer un fichier : « git rm <fichier> » ou « git mv <ancien> <nouveau> ».
- Ne modifie jamais .github/ ni charts/ (réservés aux développeurs) ; aucun secret, aucune donnée réelle.
- Dans ta réponse : ce que tu as fait, où le voir dans l'aperçu, et ce qu'il peut demander ensuite.
  Rappelle-lui, quand c'est utile, qu'il peut dire « c'est bon » pour proposer ces changements au projet.

Ta réponse finale doit être UNIQUEMENT un objet JSON, sans texte autour :
{"reponse":"<ton message au PO>"}`;
}

/** Réponse d'ADA en conversation : son JSON, ou à défaut son texte brut (mieux qu'un blocage). */
export function lireReponseConversation(texte: string): string | null {
  const json = lireJson<{ reponse?: unknown }>(texte, (valeur) => 'reponse' in valeur);
  if (json && typeof json.reponse === 'string' && json.reponse.trim()) return json.reponse.trim();
  const brut = texte.replace(/```(?:json)?/g, '').trim();
  return brut && !brut.startsWith('{') ? brut : null;
}

/** Extrait le dernier objet JSON d'une réponse (l'agent l'entoure parfois de ```json). */
export function lireJson<T>(texte: string, accepter: (valeur: Record<string, unknown>) => boolean = () => true): T | null {
  const nettoye = texte.replace(/```(?:json)?/g, '');
  // De la fin vers le début : le JSON final de l'agent, même s'il contient des objets imbriqués
  // (ses choix) ou si du texte le précède.
  for (let debut = nettoye.lastIndexOf('{"'); debut >= 0; debut = nettoye.lastIndexOf('{"', debut - 1)) {
    for (let fin = nettoye.lastIndexOf('}'); fin > debut; fin = nettoye.lastIndexOf('}', fin - 1)) {
      try {
        const valeur = JSON.parse(nettoye.slice(debut, fin + 1)) as unknown;
        if (valeur && typeof valeur === 'object' && !Array.isArray(valeur) && accepter(valeur as Record<string, unknown>)) return valeur as T;
      } catch {
        // pas un JSON complet : on essaie une fin plus courte
      }
    }
    if (debut === 0) break;
  }
  return null;
}

export function lireDecision(texte: string): DecisionAnalyse | null {
  const r = lireJson<DecisionAnalyse>(texte, (valeur) => 'decision' in valeur);
  if (!(r && ['questions', 'plan', 'decoupage', 'attente'].includes(r.decision) && typeof r.texte === 'string' && r.texte.trim())) return null;
  if (r.decision === 'decoupage') {
    const stories = nettoyerStoriesProposees(r.stories);
    // Découpage inexploitable : on garde l'explication, comme des questions (comportement d'avant).
    return stories.length ? { decision: 'decoupage', texte: r.texte, stories } : { decision: 'questions', texte: r.texte };
  }
  const choix = r.decision === 'questions' ? nettoyerChoix(r.choix) : [];
  return { decision: r.decision, texte: r.texte, ...(choix.length ? { choix } : {}) };
}

/** Ne garde que des questions à choix bien formées (au plus 3, 2 à 6 options courtes, sans doublon). */
export function nettoyerChoix(brut: unknown): QuestionAChoix[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((element) => element as Partial<QuestionAChoix>)
    .filter((element) => typeof element?.question === 'string' && element.question.trim() && Array.isArray(element.choix))
    .map((element) => ({
      // ADA numérote elle-même les questions : on retire le numéro que l'assistant a pu ajouter (« 1. »).
      question: element.question!.trim().replace(/^\d+\s*[.)]\s*/, '').slice(0, 300),
      choix: [...new Set((element.choix as unknown[]).filter((option): option is string => typeof option === 'string' && option.trim() !== '').map((option) => option.trim().slice(0, 200)))].slice(0, 6),
      plusieurs: element.plusieurs === true,
    }))
    .filter((element) => element.choix.length >= 2)
    .slice(0, 3);
}

/**
 * Texte du commentaire de questions : lisible sur GitHub (options en cases « - [ ] ») et, en fin,
 * les choix structurés pour l'écran d'ADA, dans un commentaire HTML (encodés : aucun « -- »).
 */
export function texteQuestions(decision: DecisionAnalyse): string {
  if (!decision.choix?.length) return decision.texte;
  const lisible = decision.choix
    .map(
      (question, rang) =>
        `${rang + 1}. ${question.question} (${question.plusieurs ? 'plusieurs réponses possibles' : 'une seule réponse'})\n` +
        question.choix.map((option) => `   - [ ] ${option}`).join('\n'),
    )
    .join('\n');
  const donnees = Buffer.from(JSON.stringify(decision.choix), 'utf8').toString('base64');
  return `${decision.texte}\n\n**Choix proposés** (à cocher dans ADA) :\n${lisible}\n\n<!-- ${MARQUEUR_CHOIX} ${donnees} -->`;
}

export function lireResultat(texte: string): ResultatRealisation | null {
  const r = lireJson<ResultatRealisation>(texte, (valeur) => 'resultat' in valeur);
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
