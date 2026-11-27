/**
 * Language model chosen by the user themselves: the address of an OpenAI-compatible gateway,
 * its key and the model name. Kept per user (GitHub login), encrypted on the server disk
 * (AES-256-GCM, key derived from SESSION_SECRET, like the sessions), never returned in clear to the screen.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseStored } from '../legacy/legacy-storage.js';

export interface UserModel {
  address: string;
  /** May be empty (local gateway without a key, like Ollama). */
  key: string;
  model: string;
}

/** What the screen is allowed to see: never the key, only its last characters. */
export interface PublicModel {
  configure: boolean;
  address: string;
  model: string;
  endKey: string | null;
}

export interface TestResult {
  ok: boolean;
  /** True: the model called the requested tool (condition for the agent to act instead of explaining). */
  toolCalls: boolean;
  message: string;
}

/** Removes the trailing “/” without a regular expression (a very long address must not slow down the server). */
export function withoutTrailingSlash(address: string): string {
  let end = address.length;
  while (end > 0 && address[end - 1] === '/') end--;
  return address.slice(0, end);
}

/** Private, local, carrier-shared (100.64.0.0/10), reserved or multicast IPv4. */
function isInternalIpv4(address: string): boolean {
  const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
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

/** “::ffff:7f00:1” or “::ffff:127.0.0.1”: an IPv4 written as IPv6, to judge like the IPv4 it hides. */
function ipv4HiddenInIpv6(address: string): string | null {
  const rest = /^(?:0:0:0:0:0:|::)ffff:(.+)$/.exec(address)?.[1];
  if (!rest) return null;
  if (isIP(rest) === 4) return rest;
  const pieces = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
  if (!pieces) return '0.0.0.0'; // unexpected shape: treated as internal
  const upper = parseInt(pieces[1]!, 16);
  const lower = parseInt(pieces[2]!, 16);
  return `${upper >> 8}.${upper & 255}.${lower >> 8}.${lower & 255}`;
}

/** Addresses that target the server itself or its internal network: refused, because the server is the one calling the given address. */
export function isInternalAddress(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local') || name.endsWith('.internal') || (!name.includes('.') && isIP(name) === 0)) return true;
  if (isIP(name) === 4) return isInternalIpv4(name);
  if (isIP(name) === 6) {
    const hidden = ipv4HiddenInIpv6(name);
    if (hidden !== null) return isInternalIpv4(hidden);
    return name === '::1' || name === '::' || /^f[cd]/.test(name) || /^fe[89a-f]/.test(name) || name.startsWith('ff');
  }
  return false;
}

type Resolver = (name: string) => Promise<{ address: string }[]>;

/**
 * A domain name can point to the server's internal network: the address must resolve, and to public
 * addresses only. Returns the error message to display, or null. Known limit: the resolution can change
 * after this check (DNS rebinding); only a network rule on the server really prevents it.
 */
export async function checkResolution(host: string, resolveHost: Resolver = (name) => lookup(name, { all: true })): Promise<string | null> {
  if (isIP(host.replace(/^\[|\]$/g, '')) !== 0) return null; // an IP address is already judged by isInternalAddress
  try {
    const addresses = await resolveHost(host);
    if (addresses.length === 0) return 'Cette adresse est introuvable : vérifiez le nom de domaine.';
    if (addresses.some(({ address }) => isInternalAddress(address))) return 'Ce nom de domaine mène au réseau interne du serveur d’ADA : indiquez une passerelle publique.';
    return null;
  } catch {
    return 'Cette adresse est introuvable : vérifiez le nom de domaine.';
  }
}

/**
 * Validates what the user enters: https required, internal addresses refused (localhost, private networks,
 * cloud metadata): the server calls this address, it must not target its own network. No list of
 * allowed domains: any public https gateway is fine.
 */
export function validateModel(raw: unknown): { value: { address: string; key: string | null; model: string } | null; errors: Record<string, string> } {
  const input = (raw ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const rawAddress = typeof input.address === 'string' ? input.address.trim() : '';
  const model = typeof input.model === 'string' ? input.model.trim() : '';
  const key = typeof input.key === 'string' && input.key.trim() !== '' ? input.key.trim() : null;

  let address = '';
  try {
    if (rawAddress.length > 2000) throw new Error('adresse trop longue');
    const url = new URL(rawAddress);
    if (url.protocol !== 'https:') errors.address = 'L’adresse doit commencer par https://.';
    else if (isInternalAddress(url.hostname)) errors.address = 'Cette adresse n’est pas accessible depuis le serveur d’ADA : indiquez une passerelle en https, joignable depuis Internet.';
    else if (url.username || url.password) errors.address = 'Ne mettez ni identifiant ni mot de passe dans l’adresse : utilisez le champ clé.';
    else address = withoutTrailingSlash(rawAddress);
  } catch {
    errors.address = 'Adresse invalide (exemple : https://llm.mon-organisation.fr/v1).';
  }
  if (!model) errors.model = 'Indiquez le nom du modèle.';
  else if (model.length > 200 || /[\s]/.test(model)) errors.model = 'Nom de modèle invalide (sans espace, 200 caractères au plus).';
  if (key && (key.length > 1000 || /[\r\n]/.test(key))) errors.key = 'Clé invalide.';
  return Object.keys(errors).length ? { value: null, errors } : { value: { address, key, model }, errors };
}

export function toPublic(model: UserModel | null): PublicModel {
  if (!model) return { configure: false, address: '', model: '', endKey: null };
  return { configure: true, address: model.address, model: model.model, endKey: model.key ? `…${model.key.slice(-4)}` : null };
}

/** Environment variables of the agent for this model: the key never goes through a command option. */
export function modelEnvironment(model: UserModel): Record<string, string> {
  return { OPENAI_BASE_URL: model.address, OPENAI_API_KEY: model.key, OPENAI_MODEL: model.model };
}

export class UserModelStore {
  private readonly key: Buffer;

  constructor(
    private readonly folder: string,
    secret: string,
  ) {
    this.key = scryptSync(secret, 'atelier-po:modeles-utilisateur', 32);
  }

  private filePath(login: string): string {
    return join(this.folder, `${createHash('sha256').update(login.toLowerCase()).digest('hex')}.json`);
  }

  encrypt(model: UserModel): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const content = Buffer.concat([cipher.update(JSON.stringify(model), 'utf8'), cipher.final()]);
    return JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), content: content.toString('base64') });
  }

  decrypt(text: string): UserModel {
    const { iv, tag, content } = parseStored<{ iv: string; tag: string; content: string }>(text);
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(content, 'base64')), decipher.final()]);
    return parseStored<UserModel>(plain.toString('utf8'));
  }

  /** Missing, unreadable or forged (invalid tag, SESSION_SECRET changed): no personal model. */
  async read(login: string): Promise<UserModel | null> {
    try {
      return this.decrypt(await readFile(this.filePath(login), 'utf8'));
    } catch {
      return null;
    }
  }

  async save(login: string, model: UserModel): Promise<void> {
    await mkdir(this.folder, { recursive: true, mode: 0o700 });
    await writeFile(this.filePath(login), this.encrypt(model), { mode: 0o600 });
  }

  async remove(login: string): Promise<void> {
    await rm(this.filePath(login), { force: true });
  }
}

/**
 * Gateway trial: a short request that asks to call a tool. Says whether the address and the key
 * work and, above all, whether the model can call tools (otherwise the agent would explain instead of acting).
 */
export async function testGateway(model: UserModel, callFetch: typeof fetch = fetch): Promise<TestResult> {
  try {
    const response = await callFetch(`${withoutTrailingSlash(model.address)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(model.key ? { Authorization: `Bearer ${model.key}` } : {}) },
      body: JSON.stringify({
        model: model.model,
        messages: [{ role: 'user', content: 'Appelle l’outil dire_bonjour avec le nom « ADA ». Ne réponds pas autrement.' }],
        tools: [
          { type: 'function', function: { name: 'dire_bonjour', description: 'Dit bonjour à quelqu’un.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['nom'] } } },
        ],
      }),
      signal: AbortSignal.timeout(60000),
      redirect: 'error',
    });
    if (response.status === 401 || response.status === 403) return { ok: false, toolCalls: false, message: 'La passerelle refuse la clé (erreur ' + response.status + ').' };
    if (response.status === 404) return { ok: false, toolCalls: false, message: 'Adresse ou modèle introuvable (erreur 404). L’adresse se termine souvent par /v1.' };
    if (!response.ok) return { ok: false, toolCalls: false, message: `La passerelle a répondu une erreur ${response.status}.` };
    const data = (await response.json()) as { choices?: { message?: { tool_calls?: unknown[] } }[] };
    const calls = data.choices?.[0]?.message?.tool_calls;
    if (Array.isArray(calls) && calls.length > 0) return { ok: true, toolCalls: true, message: 'Connexion réussie : le modèle sait appeler des outils.' };
    return {
      ok: true,
      toolCalls: false,
      message: 'Connexion réussie, mais ce modèle n’a pas appelé l’outil demandé : il risque d’expliquer au lieu d’agir. Essayez un autre modèle.',
    };
  } catch (error) {
    const reason = (error as Error).name === 'TimeoutError' ? 'délai dépassé' : 'adresse injoignable';
    return { ok: false, toolCalls: false, message: `Connexion impossible (${reason}).` };
  }
}
