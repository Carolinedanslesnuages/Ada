import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adresseInterne, environnementModele, StoreModeleUtilisateur, testerPasserelle, verifierModele, sansBarreFinale, verifierResolution, versPublic } from './modele-utilisateur.js';

const MODELE = { adresse: 'https://llm.exemple.fr/v1', cle: 'sk-secret-1234', modele: 'glm-5' };

describe('Mon modèle : validation de la saisie', () => {
  it('accepte une saisie complète et retire la barre finale de l’adresse', () => {
    expect(verifierModele({ adresse: ' https://llm.exemple.fr/v1/ ', cle: 'k', modele: 'glm-5' }).valeur).toEqual({ adresse: 'https://llm.exemple.fr/v1', cle: 'k', modele: 'glm-5' });
  });
  it('la clé est facultative : absente, elle vaut null', () => {
    expect(verifierModele({ adresse: 'https://llm.exemple.fr/v1', modele: 'glm-5' }).valeur?.cle).toBeNull();
  });
  it('https obligatoire : http refusé, même pour une adresse publique', () => {
    expect(verifierModele({ adresse: 'http://llm.exemple.fr/v1', modele: 'm' }).erreurs.adresse).toMatch(/https/);
  });
  it('adresses locales et internes refusées (Ollama local, réseaux privés, métadonnées du cloud)', () => {
    for (const interne of ['https://localhost:11434/v1', 'https://127.0.0.1/v1', 'https://10.0.0.5/v1', 'https://192.168.1.20/v1', 'https://169.254.169.254/latest', 'https://intranet/v1', 'https://[::1]/v1', 'http://localhost:11434/v1']) {
      expect(verifierModele({ adresse: interne, modele: 'm' }).erreurs.adresse, interne).toBeTruthy();
    }
  });
  it('accepte une passerelle publique en https, sans liste de domaines autorisés', () => {
    expect(verifierModele({ adresse: 'https://llm.exemple.fr/v1', modele: 'm' }).valeur).not.toBeNull();
    expect(verifierModele({ adresse: 'https://api.autre-fournisseur.com/v1', modele: 'm' }).valeur).not.toBeNull();
  });
  it('refuse une adresse invalide, un identifiant dans l’adresse, un modèle vide ou avec des espaces', () => {
    expect(verifierModele({ adresse: 'pas une adresse', modele: 'm' }).erreurs.adresse).toBeTruthy();
    expect(verifierModele({ adresse: 'ftp://x.fr', modele: 'm' }).erreurs.adresse).toBeTruthy();
    expect(verifierModele({ adresse: 'https://user:mdp@x.fr/v1', modele: 'm' }).erreurs.adresse).toBeTruthy();
    expect(verifierModele({ adresse: 'https://x.fr/v1', modele: '' }).erreurs.modele).toBeTruthy();
    expect(verifierModele({ adresse: 'https://x.fr/v1', modele: 'deux mots' }).erreurs.modele).toBeTruthy();
  });
  it('reconnaît les adresses internes', () => {
    expect(adresseInterne('192.168.0.1')).toBe(true);
    expect(adresseInterne('172.20.1.1')).toBe(true);
    expect(adresseInterne('172.32.1.1')).toBe(false);
    expect(adresseInterne('llm.exemple.fr')).toBe(false);
  });
});

describe('Mon modèle : adresses cachées et noms de domaine', () => {
  it('reconnaît une IPv4 interne écrite en IPv6, le réseau partagé des opérateurs et les adresses réservées', () => {
    for (const interne of ['[::ffff:127.0.0.1]', '[::ffff:10.0.0.5]', '[::ffff:a9fe:a9fe]', '100.64.0.1', '100.127.255.254', '198.18.0.1', '224.0.0.1', '[fe80::1]', '[febf::1]', '[fec0::1]', '[ff02::1]', '[fd12:3456::1]']) {
      expect(adresseInterne(interne), interne).toBe(true);
    }
    for (const publique of ['100.128.0.1', '8.8.8.8', '[2606:4700:4700::1111]', '[::ffff:8.8.8.8]']) expect(adresseInterne(publique), publique).toBe(false);
  });
  it('refuse en https une IPv4 interne cachée dans l’adresse saisie', () => {
    expect(verifierModele({ adresse: 'https://[::ffff:127.0.0.1]/v1', modele: 'm' }).erreurs.adresse).toBeTruthy();
    expect(verifierModele({ adresse: 'https://[::ffff:7f00:1]/v1', modele: 'm' }).erreurs.adresse).toBeTruthy();
  });
  it('refuse un nom de domaine qui se résout vers le réseau interne, même pour une seule de ses adresses', async () => {
    const interne = async () => [{ address: '10.0.0.5' }];
    const mixte = async () => [{ address: '8.8.8.8' }, { address: '127.0.0.1' }];
    expect(await verifierResolution('llm.exemple.fr', interne)).toMatch(/réseau interne/);
    expect(await verifierResolution('llm.exemple.fr', mixte)).toMatch(/réseau interne/);
  });
  it('accepte un nom de domaine qui se résout vers des adresses publiques', async () => {
    expect(await verifierResolution('llm.exemple.fr', async () => [{ address: '203.0.113.7' }, { address: '2606:4700::1' }])).toBeNull();
  });
  it('refuse un nom de domaine introuvable, et ne résout pas une adresse IP déjà jugée', async () => {
    expect(await verifierResolution('inconnu.exemple.fr', async () => { throw new Error('ENOTFOUND'); })).toMatch(/introuvable/);
    expect(await verifierResolution('inconnu.exemple.fr', async () => [])).toMatch(/introuvable/);
    expect(await verifierResolution('8.8.8.8', async () => { throw new Error('ne doit pas être appelé'); })).toBeNull();
  });
});

describe('Mon modèle : barres finales de l’adresse', () => {
  it('retire toutes les barres finales, rien d’autre', () => {
    expect(sansBarreFinale('https://llm.exemple.fr/v1///')).toBe('https://llm.exemple.fr/v1');
    expect(sansBarreFinale('https://llm.exemple.fr/v1')).toBe('https://llm.exemple.fr/v1');
    expect(sansBarreFinale('/')).toBe('');
  });
  it('une adresse très longue est refusée vite, sans ralentir le serveur', () => {
    const debut = Date.now();
    expect(verifierModele({ adresse: `https://x.fr/${'/'.repeat(200000)}`, modele: 'm' }).erreurs.adresse).toBeTruthy();
    expect(Date.now() - debut).toBeLessThan(500);
  });
});

describe('Mon modèle : stockage chiffré', () => {
  const dossier = () => mkdtempSync(join(tmpdir(), 'modeles-'));
  it('relit ce qui a été enregistré, par utilisateur (sans tenir compte de la casse)', async () => {
    const store = new StoreModeleUtilisateur(dossier(), 'x'.repeat(32));
    await store.enregistrer('Caroline', MODELE);
    expect(await store.lire('caroline')).toEqual(MODELE);
    expect(await store.lire('quelquun-d-autre')).toBeNull();
  });
  it('n’écrit jamais la clé ni l’adresse en clair sur le disque', async () => {
    const repertoire = dossier();
    await new StoreModeleUtilisateur(repertoire, 'x'.repeat(32)).enregistrer('caroline', MODELE);
    const contenu = readdirSync(repertoire).map((nom) => readFileSync(join(repertoire, nom), 'utf8')).join('');
    expect(contenu).not.toContain('sk-secret-1234');
    expect(contenu).not.toContain('llm.exemple.fr');
    expect(readdirSync(repertoire).join('')).not.toContain('caroline');
  });
  it('un secret de session différent ne déchiffre pas : pas de modèle, jamais d’erreur', async () => {
    const repertoire = dossier();
    await new StoreModeleUtilisateur(repertoire, 'a'.repeat(32)).enregistrer('caroline', MODELE);
    expect(await new StoreModeleUtilisateur(repertoire, 'b'.repeat(32)).lire('caroline')).toBeNull();
  });
  it('supprime le modèle', async () => {
    const store = new StoreModeleUtilisateur(dossier(), 'x'.repeat(32));
    await store.enregistrer('caroline', MODELE);
    await store.supprimer('caroline');
    expect(await store.lire('caroline')).toBeNull();
  });
});

describe('Mon modèle : ce que voit l’écran et ce que reçoit l’agent', () => {
  it('l’écran ne reçoit jamais la clé, seulement ses 4 derniers caractères', () => {
    const vue = versPublic(MODELE);
    expect(JSON.stringify(vue)).not.toContain('sk-secret');
    expect(vue).toEqual({ configure: true, adresse: MODELE.adresse, modele: 'glm-5', cleFin: '…1234' });
    expect(versPublic(null).configure).toBe(false);
  });
  it('l’agent reçoit tout par l’environnement', () => {
    expect(environnementModele(MODELE)).toEqual({ OPENAI_BASE_URL: MODELE.adresse, OPENAI_API_KEY: MODELE.cle, OPENAI_MODEL: 'glm-5' });
  });
});

describe('Mon modèle : essai de la passerelle', () => {
  const reponse = (statut: number, corps: unknown = {}) => (async () => new Response(JSON.stringify(corps), { status: statut })) as unknown as typeof fetch;
  it('réussi quand le modèle appelle l’outil', async () => {
    const resultat = await testerPasserelle(MODELE, reponse(200, { choices: [{ message: { tool_calls: [{ id: '1' }] } }] }));
    expect(resultat).toMatchObject({ ok: true, appelsOutils: true });
  });
  it('avertit quand le modèle répond sans appeler d’outil', async () => {
    const resultat = await testerPasserelle(MODELE, reponse(200, { choices: [{ message: { content: 'Bonjour !' } }] }));
    expect(resultat).toMatchObject({ ok: true, appelsOutils: false });
    expect(resultat.message).toMatch(/expliquer au lieu d’agir/);
  });
  it('dit si la clé est refusée, si l’adresse est introuvable ou injoignable', async () => {
    expect((await testerPasserelle(MODELE, reponse(401))).message).toMatch(/refuse la clé/);
    expect((await testerPasserelle(MODELE, reponse(404))).message).toMatch(/introuvable/);
    const injoignable = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect((await testerPasserelle(MODELE, injoignable)).message).toMatch(/injoignable/);
  });
  it('n’envoie la clé que dans l’en-tête d’autorisation, vers l’adresse donnée', async () => {
    const vus: { url: string; autorisation: string | null }[] = [];
    const espion = (async (url: string, options: RequestInit) => {
      vus.push({ url, autorisation: (options.headers as Record<string, string>).Authorization ?? null });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await testerPasserelle(MODELE, espion);
    expect(vus).toEqual([{ url: 'https://llm.exemple.fr/v1/chat/completions', autorisation: 'Bearer sk-secret-1234' }]);
    vus.length = 0;
    await testerPasserelle({ ...MODELE, cle: '' }, espion);
    expect(vus[0]?.autorisation).toBeNull();
  });
});
