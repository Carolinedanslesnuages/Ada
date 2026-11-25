/**
 * Modèle de langage choisi par l'utilisateur lui-même : l'adresse d'une passerelle compatible OpenAI,
 * sa clé et le nom du modèle. Conservé par utilisateur (login GitHub), chiffré sur le disque du serveur
 * (AES-256-GCM, clé dérivée de SESSION_SECRET, comme les sessions), jamais renvoyé en clair à l'écran.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ModeleUtilisateur {
  adresse: string;
  /** Peut être vide (passerelle locale sans clé, comme Ollama). */
  cle: string;
  modele: string;
}

/** Ce que l'écran a le droit de voir : jamais la clé, seulement ses derniers caractères. */
export interface ModelePublic {
  configure: boolean;
  adresse: string;
  modele: string;
  cleFin: string | null;
}

export interface ResultatTest {
  ok: boolean;
  /** Vrai : le modèle a appelé l'outil demandé (condition pour que l'agent agisse au lieu d'expliquer). */
  appelsOutils: boolean;
  message: string;
}

/** IPv4 privée, locale, partagée par les opérateurs (100.64.0.0/10), réservée ou de multidiffusion. */
function ipv4Interne(adresse: string): boolean {
  const [a = 0, b = 0, c = 0] = adresse.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** « ::ffff:7f00:1 » ou « ::ffff:127.0.0.1 » : une IPv4 écrite en IPv6, à juger comme l'IPv4 qu'elle cache. */
function ipv4CacheeEnIpv6(adresse: string): string | null {
  const reste = /^(?:0:0:0:0:0:|::)ffff:(.+)$/.exec(adresse)?.[1];
  if (!reste) return null;
  if (isIP(reste) === 4) return reste;
  const morceaux = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(reste);
  if (!morceaux) return '0.0.0.0'; // forme inattendue : traitée comme interne
  const haut = parseInt(morceaux[1]!, 16);
  const bas = parseInt(morceaux[2]!, 16);
  return `${haut >> 8}.${haut & 255}.${bas >> 8}.${bas & 255}`;
}

/** Adresses qui visent le serveur lui-même ou son réseau interne : refusées, car c'est le serveur qui appelle l'adresse saisie. */
export function adresseInterne(hote: string): boolean {
  const nom = hote.toLowerCase().replace(/^\[|\]$/g, '');
  if (nom === 'localhost' || nom.endsWith('.localhost') || nom.endsWith('.local') || nom.endsWith('.internal') || (!nom.includes('.') && isIP(nom) === 0)) return true;
  if (isIP(nom) === 4) return ipv4Interne(nom);
  if (isIP(nom) === 6) {
    const cachee = ipv4CacheeEnIpv6(nom);
    if (cachee !== null) return ipv4Interne(cachee);
    return nom === '::1' || nom === '::' || /^f[cd]/.test(nom) || /^fe[89a-f]/.test(nom) || nom.startsWith('ff');
  }
  return false;
}

type Resolveur = (nom: string) => Promise<{ address: string }[]>;

/**
 * Un nom de domaine peut pointer vers le réseau interne du serveur : l'adresse doit se résoudre, et vers des adresses
 * publiques seulement. Renvoie le message d'erreur à afficher, ou null. Limite connue : la résolution peut changer
 * après cette vérification (rebinding DNS) ; seule une règle réseau sur le serveur l'empêche vraiment.
 */
export async function verifierResolution(hote: string, resoudre: Resolveur = (nom) => lookup(nom, { all: true })): Promise<string | null> {
  if (isIP(hote.replace(/^\[|\]$/g, '')) !== 0) return null; // une adresse IP est déjà jugée par adresseInterne
  try {
    const adresses = await resoudre(hote);
    if (adresses.length === 0) return 'Cette adresse est introuvable : vérifiez le nom de domaine.';
    if (adresses.some(({ address }) => adresseInterne(address))) return 'Ce nom de domaine mène au réseau interne du serveur d’ADA : indiquez une passerelle publique.';
    return null;
  } catch {
    return 'Cette adresse est introuvable : vérifiez le nom de domaine.';
  }
}

/**
 * Valide ce que saisit l'utilisateur : https obligatoire, adresses internes refusées (localhost, réseaux privés,
 * métadonnées du cloud) : le serveur appelle cette adresse, il ne doit pas viser son propre réseau. Aucune liste de
 * domaines autorisés : n'importe quelle passerelle publique en https convient.
 */
export function verifierModele(brut: unknown): { valeur: { adresse: string; cle: string | null; modele: string } | null; erreurs: Record<string, string> } {
  const saisie = (brut ?? {}) as Record<string, unknown>;
  const erreurs: Record<string, string> = {};
  const adresseBrute = typeof saisie.adresse === 'string' ? saisie.adresse.trim() : '';
  const modele = typeof saisie.modele === 'string' ? saisie.modele.trim() : '';
  const cle = typeof saisie.cle === 'string' && saisie.cle.trim() !== '' ? saisie.cle.trim() : null;

  let adresse = '';
  try {
    const url = new URL(adresseBrute);
    if (url.protocol !== 'https:') erreurs.adresse = 'L’adresse doit commencer par https://.';
    else if (adresseInterne(url.hostname)) erreurs.adresse = 'Cette adresse n’est pas accessible depuis le serveur d’ADA : indiquez une passerelle en https, joignable depuis Internet.';
    else if (url.username || url.password) erreurs.adresse = 'Ne mettez ni identifiant ni mot de passe dans l’adresse : utilisez le champ clé.';
    else adresse = adresseBrute.replace(/\/+$/, '');
  } catch {
    erreurs.adresse = 'Adresse invalide (exemple : https://llm.mon-organisation.fr/v1).';
  }
  if (!modele) erreurs.modele = 'Indiquez le nom du modèle.';
  else if (modele.length > 200 || /[\s]/.test(modele)) erreurs.modele = 'Nom de modèle invalide (sans espace, 200 caractères au plus).';
  if (cle && (cle.length > 1000 || /[\r\n]/.test(cle))) erreurs.cle = 'Clé invalide.';
  return Object.keys(erreurs).length ? { valeur: null, erreurs } : { valeur: { adresse, cle, modele }, erreurs };
}

export function versPublic(modele: ModeleUtilisateur | null): ModelePublic {
  if (!modele) return { configure: false, adresse: '', modele: '', cleFin: null };
  return { configure: true, adresse: modele.adresse, modele: modele.modele, cleFin: modele.cle ? `…${modele.cle.slice(-4)}` : null };
}

/** Variables d'environnement de l'agent pour ce modèle : la clé ne passe jamais par une option de commande. */
export function environnementModele(modele: ModeleUtilisateur): Record<string, string> {
  return { OPENAI_BASE_URL: modele.adresse, OPENAI_API_KEY: modele.cle, OPENAI_MODEL: modele.modele };
}

export class StoreModeleUtilisateur {
  private readonly cle: Buffer;

  constructor(
    private readonly dossier: string,
    secret: string,
  ) {
    this.cle = scryptSync(secret, 'atelier-po:modeles-utilisateur', 32);
  }

  private chemin(login: string): string {
    return join(this.dossier, `${createHash('sha256').update(login.toLowerCase()).digest('hex')}.json`);
  }

  chiffrer(modele: ModeleUtilisateur): string {
    const iv = randomBytes(12);
    const chiffreur = createCipheriv('aes-256-gcm', this.cle, iv);
    const contenu = Buffer.concat([chiffreur.update(JSON.stringify(modele), 'utf8'), chiffreur.final()]);
    return JSON.stringify({ iv: iv.toString('base64'), tag: chiffreur.getAuthTag().toString('base64'), contenu: contenu.toString('base64') });
  }

  dechiffrer(texte: string): ModeleUtilisateur {
    const { iv, tag, contenu } = JSON.parse(texte) as { iv: string; tag: string; contenu: string };
    const dechiffreur = createDecipheriv('aes-256-gcm', this.cle, Buffer.from(iv, 'base64'));
    dechiffreur.setAuthTag(Buffer.from(tag, 'base64'));
    const clair = Buffer.concat([dechiffreur.update(Buffer.from(contenu, 'base64')), dechiffreur.final()]);
    return JSON.parse(clair.toString('utf8')) as ModeleUtilisateur;
  }

  /** Absent, illisible ou falsifié (étiquette invalide, SESSION_SECRET changé) : pas de modèle personnel. */
  async lire(login: string): Promise<ModeleUtilisateur | null> {
    try {
      return this.dechiffrer(await readFile(this.chemin(login), 'utf8'));
    } catch {
      return null;
    }
  }

  async enregistrer(login: string, modele: ModeleUtilisateur): Promise<void> {
    await mkdir(this.dossier, { recursive: true, mode: 0o700 });
    await writeFile(this.chemin(login), this.chiffrer(modele), { mode: 0o600 });
  }

  async supprimer(login: string): Promise<void> {
    await rm(this.chemin(login), { force: true });
  }
}

/**
 * Essai de la passerelle : une courte requête qui demande d'appeler un outil. Dit si l'adresse et la clé
 * marchent et, surtout, si le modèle sait appeler des outils (sinon l'agent expliquerait au lieu d'agir).
 */
export async function testerPasserelle(modele: ModeleUtilisateur, appeler: typeof fetch = fetch): Promise<ResultatTest> {
  try {
    const reponse = await appeler(`${modele.adresse.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(modele.cle ? { Authorization: `Bearer ${modele.cle}` } : {}) },
      body: JSON.stringify({
        model: modele.modele,
        messages: [{ role: 'user', content: 'Appelle l’outil dire_bonjour avec le nom « ADA ». Ne réponds pas autrement.' }],
        tools: [
          { type: 'function', function: { name: 'dire_bonjour', description: 'Dit bonjour à quelqu’un.', parameters: { type: 'object', properties: { nom: { type: 'string' } }, required: ['nom'] } } },
        ],
      }),
      signal: AbortSignal.timeout(60000),
      redirect: 'error',
    });
    if (reponse.status === 401 || reponse.status === 403) return { ok: false, appelsOutils: false, message: 'La passerelle refuse la clé (erreur ' + reponse.status + ').' };
    if (reponse.status === 404) return { ok: false, appelsOutils: false, message: 'Adresse ou modèle introuvable (erreur 404). L’adresse se termine souvent par /v1.' };
    if (!reponse.ok) return { ok: false, appelsOutils: false, message: `La passerelle a répondu une erreur ${reponse.status}.` };
    const donnees = (await reponse.json()) as { choices?: { message?: { tool_calls?: unknown[] } }[] };
    const appels = donnees.choices?.[0]?.message?.tool_calls;
    if (Array.isArray(appels) && appels.length > 0) return { ok: true, appelsOutils: true, message: 'Connexion réussie : le modèle sait appeler des outils.' };
    return {
      ok: true,
      appelsOutils: false,
      message: 'Connexion réussie, mais ce modèle n’a pas appelé l’outil demandé : il risque d’expliquer au lieu d’agir. Essayez un autre modèle.',
    };
  } catch (erreur) {
    const raison = (erreur as Error).name === 'TimeoutError' ? 'délai dépassé' : 'adresse injoignable';
    return { ok: false, appelsOutils: false, message: `Connexion impossible (${raison}).` };
  }
}
