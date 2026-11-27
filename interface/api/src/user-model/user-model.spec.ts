import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isInternalAddress, modelEnvironment, UserModelStore, testGateway, validateModel, withoutTrailingSlash, checkResolution, toPublic } from './user-model.js';

const TEMPLATE = { address: 'https://llm.exemple.fr/v1', key: 'sk-secret-1234', model: 'glm-5' };

describe('My model: input validation', () => {
  it('accepts a complete input and removes the trailing slash of the address', () => {
    expect(validateModel({ address: ' https://llm.exemple.fr/v1/ ', key: 'k', model: 'glm-5' }).value).toEqual({ address: 'https://llm.exemple.fr/v1', key: 'k', model: 'glm-5' });
  });
  it('the key is optional: when missing, it is null', () => {
    expect(validateModel({ address: 'https://llm.exemple.fr/v1', model: 'glm-5' }).value?.key).toBeNull();
  });
  it('https required: http refused, even for a public address', () => {
    expect(validateModel({ address: 'http://llm.exemple.fr/v1', model: 'm' }).errors.address).toMatch(/https/);
  });
  it('local and internal addresses refused (local Ollama, private networks, cloud metadata)', () => {
    for (const internal of ['https://localhost:11434/v1', 'https://127.0.0.1/v1', 'https://10.0.0.5/v1', 'https://192.168.1.20/v1', 'https://169.254.169.254/latest', 'https://intranet/v1', 'https://[::1]/v1', 'http://localhost:11434/v1']) {
      expect(validateModel({ address: internal, model: 'm' }).errors.address, internal).toBeTruthy();
    }
  });
  it('accepts a public https gateway, without a list of allowed domains', () => {
    expect(validateModel({ address: 'https://llm.exemple.fr/v1', model: 'm' }).value).not.toBeNull();
    expect(validateModel({ address: 'https://api.autre-fournisseur.com/v1', model: 'm' }).value).not.toBeNull();
  });
  it('refuses an invalid address, credentials in the address, an empty model or one with spaces', () => {
    expect(validateModel({ address: 'pas une adresse', model: 'm' }).errors.address).toBeTruthy();
    expect(validateModel({ address: 'ftp://x.fr', model: 'm' }).errors.address).toBeTruthy();
    expect(validateModel({ address: 'https://user:mdp@x.fr/v1', model: 'm' }).errors.address).toBeTruthy();
    expect(validateModel({ address: 'https://x.fr/v1', model: '' }).errors.model).toBeTruthy();
    expect(validateModel({ address: 'https://x.fr/v1', model: 'deux mots' }).errors.model).toBeTruthy();
  });
  it('recognizes internal addresses', () => {
    expect(isInternalAddress('192.168.0.1')).toBe(true);
    expect(isInternalAddress('172.20.1.1')).toBe(true);
    expect(isInternalAddress('172.32.1.1')).toBe(false);
    expect(isInternalAddress('llm.exemple.fr')).toBe(false);
  });
});

describe('My model: hidden addresses and domain names', () => {
  it('recognizes an internal IPv4 written as IPv6, the carriers\' shared network and the reserved addresses', () => {
    for (const internal of ['[::ffff:127.0.0.1]', '[::ffff:10.0.0.5]', '[::ffff:a9fe:a9fe]', '100.64.0.1', '100.127.255.254', '198.18.0.1', '224.0.0.1', '[fe80::1]', '[febf::1]', '[fec0::1]', '[ff02::1]', '[fd12:3456::1]']) {
      expect(isInternalAddress(internal), internal).toBe(true);
    }
    for (const isPublic of ['100.128.0.1', '8.8.8.8', '[2606:4700:4700::1111]', '[::ffff:8.8.8.8]']) expect(isInternalAddress(isPublic), isPublic).toBe(false);
  });
  it('refuses over https an internal IPv4 hidden in the given address', () => {
    expect(validateModel({ address: 'https://[::ffff:127.0.0.1]/v1', model: 'm' }).errors.address).toBeTruthy();
    expect(validateModel({ address: 'https://[::ffff:7f00:1]/v1', model: 'm' }).errors.address).toBeTruthy();
  });
  it('refuses a domain name that resolves to the internal network, even for a single one of its addresses', async () => {
    const internal = async () => [{ address: '10.0.0.5' }];
    const mixed = async () => [{ address: '8.8.8.8' }, { address: '127.0.0.1' }];
    expect(await checkResolution('llm.exemple.fr', internal)).toMatch(/réseau interne/);
    expect(await checkResolution('llm.exemple.fr', mixed)).toMatch(/réseau interne/);
  });
  it('accepts a domain name that resolves to public addresses', async () => {
    expect(await checkResolution('llm.exemple.fr', async () => [{ address: '203.0.113.7' }, { address: '2606:4700::1' }])).toBeNull();
  });
  it('refuses a domain name that cannot be found, and does not resolve an IP address already judged', async () => {
    expect(await checkResolution('inconnu.exemple.fr', async () => { throw new Error('ENOTFOUND'); })).toMatch(/introuvable/);
    expect(await checkResolution('inconnu.exemple.fr', async () => [])).toMatch(/introuvable/);
    expect(await checkResolution('8.8.8.8', async () => { throw new Error('ne doit pas être appelé'); })).toBeNull();
  });
});

describe('My model: trailing slashes of the address', () => {
  it('removes every trailing slash, nothing else', () => {
    expect(withoutTrailingSlash('https://llm.exemple.fr/v1///')).toBe('https://llm.exemple.fr/v1');
    expect(withoutTrailingSlash('https://llm.exemple.fr/v1')).toBe('https://llm.exemple.fr/v1');
    expect(withoutTrailingSlash('/')).toBe('');
  });
  it('a very long address is refused quickly, without slowing down the server', () => {
    const start = Date.now();
    expect(validateModel({ address: `https://x.fr/${'/'.repeat(200000)}`, model: 'm' }).errors.address).toBeTruthy();
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('My model: encrypted storage', () => {
  const folder = () => mkdtempSync(join(tmpdir(), 'modeles-'));
  it('reads back what was saved, per user (ignoring case)', async () => {
    const store = new UserModelStore(folder(), 'x'.repeat(32));
    await store.save('Caroline', TEMPLATE);
    expect(await store.read('caroline')).toEqual(TEMPLATE);
    expect(await store.read('quelquun-d-autre')).toBeNull();
  });
  it('never writes the key or the address in clear on disk', async () => {
    const directory = folder();
    await new UserModelStore(directory, 'x'.repeat(32)).save('caroline', TEMPLATE);
    const content = readdirSync(directory).map((name) => readFileSync(join(directory, name), 'utf8')).join('');
    expect(content).not.toContain('sk-secret-1234');
    expect(content).not.toContain('llm.exemple.fr');
    expect(readdirSync(directory).join('')).not.toContain('caroline');
  });
  it('a different session secret does not decrypt: no model, never an error', async () => {
    const directory = folder();
    await new UserModelStore(directory, 'a'.repeat(32)).save('caroline', TEMPLATE);
    expect(await new UserModelStore(directory, 'b'.repeat(32)).read('caroline')).toBeNull();
  });
  it('deletes the model', async () => {
    const store = new UserModelStore(folder(), 'x'.repeat(32));
    await store.save('caroline', TEMPLATE);
    await store.remove('caroline');
    expect(await store.read('caroline')).toBeNull();
  });
});

describe('My model: what the screen sees and what the agent receives', () => {
  it('the screen never receives the key, only its last 4 characters', () => {
    const vue = toPublic(TEMPLATE);
    expect(JSON.stringify(vue)).not.toContain('sk-secret');
    expect(vue).toEqual({ configure: true, address: TEMPLATE.address, model: 'glm-5', endKey: '…1234' });
    expect(toPublic(null).configure).toBe(false);
  });
  it('the agent receives everything through the environment', () => {
    expect(modelEnvironment(TEMPLATE)).toEqual({ OPENAI_BASE_URL: TEMPLATE.address, OPENAI_API_KEY: TEMPLATE.key, OPENAI_MODEL: 'glm-5' });
  });
});

describe('My model: gateway trial', () => {
  const response = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status: status })) as unknown as typeof fetch;
  it('succeeds when the model calls the tool', async () => {
    const result = await testGateway(TEMPLATE, response(200, { choices: [{ message: { tool_calls: [{ id: '1' }] } }] }));
    expect(result).toMatchObject({ ok: true, toolCalls: true });
  });
  it('warns when the model answers without calling a tool', async () => {
    const result = await testGateway(TEMPLATE, response(200, { choices: [{ message: { content: 'Bonjour !' } }] }));
    expect(result).toMatchObject({ ok: true, toolCalls: false });
    expect(result.message).toMatch(/expliquer au lieu d’agir/);
  });
  it('says whether the key is refused, or the address is not found or unreachable', async () => {
    expect((await testGateway(TEMPLATE, response(401))).message).toMatch(/refuse la clé/);
    expect((await testGateway(TEMPLATE, response(404))).message).toMatch(/introuvable/);
    const unreachable = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect((await testGateway(TEMPLATE, unreachable)).message).toMatch(/injoignable/);
  });
  it('sends the key only in the authorization header, to the given address', async () => {
    const seen: { url: string; authorization: string | null }[] = [];
    const spy = (async (url: string, options: RequestInit) => {
      seen.push({ url, authorization: (options.headers as Record<string, string>).Authorization ?? null });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await testGateway(TEMPLATE, spy);
    expect(seen).toEqual([{ url: 'https://llm.exemple.fr/v1/chat/completions', authorization: 'Bearer sk-secret-1234' }]);
    seen.length = 0;
    await testGateway({ ...TEMPLATE, key: '' }, spy);
    expect(seen[0]?.authorization).toBeNull();
  });
});
