/** Indicateurs d'ADA : fonctions pures, calculées à partir de ce que GitHub sait des demandes. */

/** Une demande (story, problème ou mode libre), telle que GitHub permet de la mesurer. */
export interface DemandeMesuree {
  livree: boolean;
  /** Fermeture de l'issue (livraison). */
  fermeeLe: string | null;
  /** Premier passage au statut « en cours » (lancement depuis ADA), s'il est connu. */
  lanceeLe: string | null;
  /** Passée au moins une fois par « Besoin d'un développeur ». */
  besoinDev: boolean;
}

export interface Mesures {
  storiesLivrees: number;
  /** Part des livrées sans passage par « Besoin d'un développeur » (0 à 1) ; null sans livraison. */
  partSansDev: number | null;
  /** Temps moyen du lancement à la livraison, en minutes ; null sans mesure possible. */
  dureeMoyenneMinutes: number | null;
}

export interface IndicateursProjet extends Mesures {
  nom: string;
}

export interface Indicateurs extends Mesures {
  projets: number;
  parProjet: IndicateursProjet[];
}

const minutesEntre = (debut: string, fin: string) => (Date.parse(fin) - Date.parse(debut)) / 60000;

function mesurer(demandes: DemandeMesuree[]): Mesures {
  const livrees = demandes.filter((demande) => demande.livree);
  const durees = livrees
    .filter((demande) => demande.lanceeLe && demande.fermeeLe)
    .map((demande) => minutesEntre(demande.lanceeLe!, demande.fermeeLe!))
    .filter((duree) => Number.isFinite(duree) && duree >= 0);
  return {
    storiesLivrees: livrees.length,
    partSansDev: livrees.length ? livrees.filter((demande) => !demande.besoinDev).length / livrees.length : null,
    dureeMoyenneMinutes: durees.length ? Math.round(durees.reduce((somme, duree) => somme + duree, 0) / durees.length) : null,
  };
}

export function calculerIndicateurs(projets: { nom: string; demandes: DemandeMesuree[] }[]): Indicateurs {
  return {
    projets: projets.length,
    ...mesurer(projets.flatMap((projet) => projet.demandes)),
    parProjet: projets
      .map((projet) => ({ nom: projet.nom, ...mesurer(projet.demandes) }))
      .sort((premier, second) => second.storiesLivrees - premier.storiesLivrees || premier.nom.localeCompare(second.nom)),
  };
}

/** Lancement et passage par « besoin d'un développeur », d'après les événements de label de l'issue. */
export function lireHistorique(
  evenements: { event?: string; created_at?: string; label?: { name?: string } | null }[],
  labelEnCours: string,
  labelBesoinDev: string,
): { lanceeLe: string | null; besoinDev: boolean } {
  const poses = evenements.filter((evenement) => evenement.event === 'labeled');
  const lancement = poses
    .filter((evenement) => evenement.label?.name === labelEnCours && evenement.created_at)
    .map((evenement) => evenement.created_at!)
    .sort()[0];
  return {
    lanceeLe: lancement ?? null,
    besoinDev: poses.some((evenement) => evenement.label?.name === labelBesoinDev),
  };
}
