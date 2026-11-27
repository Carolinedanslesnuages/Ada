// Tests des permissions de l'agent (aucun réseau) : node --test interface/api/agent-openai/runner.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasShellOperators, makePermissions, parseArgs, resolveModel, retryDelay } from './runner.mjs'

const ALLOWED = ['Read(./**)', 'Write(./**)', 'Bash(git status)', 'Bash(git status *)', 'Bash(docker compose -f ../compose.yml exec -T -u 1000 app bash -lc *)']
const DENIED = ['Write(./.github/**)', 'Bash(git commit*--file*)']
const permissions = makePermissions(ALLOWED, DENIED, '/work')

test('écriture : le projet oui, les dossiers réservés non', () => {
  assert.equal(permissions.permit('Write', '/work/src/a.ts'), true)
  assert.equal(permissions.permit('Write', '/work/.github/ci.yml'), false)
})
test('lecture hors du projet refusée', () => {
  assert.equal(permissions.permit('Read', '/etc/passwd'), false)
})
test('commandes : autorisées à l’identique, jamais enchaînées ni substituées', () => {
  assert.equal(permissions.permit('Bash', 'git status'), true)
  assert.equal(permissions.permit('Bash', 'git status; rm -rf x'), false)
  assert.equal(permissions.permit('Bash', 'git push'), false)
  assert.equal(permissions.permit('Bash', "docker compose -f ../compose.yml exec -T -u 1000 app bash -lc 'npm test && npm run lint'"), true)
  assert.equal(permissions.permit('Bash', 'docker compose -f ../compose.yml exec -T -u 1000 app bash -lc "$(id)"'), false)
  assert.equal(permissions.permit('Bash', 'git commit -m x --file=/etc/passwd'), false)
})
test('opérateurs de shell : permis entre guillemets simples seulement', () => {
  assert.equal(hasShellOperators("echo 'a;b'"), false)
  assert.equal(hasShellOperators('echo a | cat'), true)
})
test('seuls les outils autorisés sont proposés au modèle', () => {
  assert.equal(permissions.offered('Bash'), true)
  assert.equal(permissions.offered('Edit'), false)
})
test('arguments de Claude Code repris tels quels', () => {
  const options = parseArgs(['-p', 'Fais ça', '--model', 'chat', '--max-turns', '5', '--disallowedTools', 'Write(./.github/**)', '--allowedTools', 'Skill', 'Read(./**)', '--session-id', 'abc'])
  assert.deepEqual(options.allowed, ['Skill', 'Read(./**)'])
  assert.deepEqual(options.denied, ['Write(./.github/**)'])
  assert.equal(options.maxTurns, 5)
  assert.equal(options.sessionId, 'abc')
})

test('modèle libre : n’importe quel nom est transmis tel quel', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glm-ada-config-'))
  assert.deepEqual(resolveModel('glm-5', dir), { file: join(dir, 'env'), model: 'glm-5' })
  assert.deepEqual(resolveModel('meta/llama-3.3-70b', dir), { file: join(dir, 'env'), model: 'meta/llama-3.3-70b' })
  assert.deepEqual(resolveModel('', dir), { file: join(dir, 'env'), model: '' })
})
test('profil/modèle : choisit la passerelle décrite dans <profil>.env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glm-ada-config-'))
  writeFileSync(join(dir, 'ollama.env'), 'OPENAI_BASE_URL=http://localhost:11434/v1\n')
  assert.deepEqual(resolveModel('ollama/qwen3.6:35b', dir), { file: join(dir, 'ollama.env'), model: 'qwen3.6:35b' })
})

test('modèle personnel (passerelle imposée) : la clé de l’administrateur ne part jamais vers cette adresse', async () => {
  // Faux dossier personnel avec une clé « de l'administrateur » et un profil ; l'appelant impose une autre passerelle sans clé.
  const home = mkdtempSync(join(tmpdir(), 'glm-ada-home-'))
  mkdirSync(join(home, '.config', 'glm-ada'), { recursive: true })
  writeFileSync(join(home, '.config', 'glm-ada', 'env'), 'OPENAI_BASE_URL=http://admin.invalid/v1\nOPENAI_API_KEY=CLE-ADMIN\nOPENAI_MODEL=modele-admin\n')
  writeFileSync(join(home, '.config', 'glm-ada', 'bureau.env'), 'OPENAI_BASE_URL=http://admin.invalid/v1\nOPENAI_API_KEY=CLE-ADMIN\n')
  const requetes = []
  const serveur = createServer((requete, reponse) => {
    let corps = ''
    requete.on('data', (morceau) => (corps += morceau))
    requete.on('end', () => {
      requetes.push({ autorisation: requete.headers.authorization ?? null, corps: JSON.parse(corps) })
      reponse.setHeader('Content-Type', 'application/json')
      reponse.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }))
    })
  })
  await new Promise((pret) => serveur.listen(0, '127.0.0.1', pret))
  const sortie = await new Promise((fini) => {
    const enfant = spawn('node', [fileURLToPath(new URL('./runner.mjs', import.meta.url)), '-p', 'salut', '--model', 'bureau/pirate', '--no-session-persistence'], {
      env: { ...process.env, HOME: home, OPENAI_BASE_URL: `http://127.0.0.1:${serveur.address().port}/v1`, OPENAI_API_KEY: '', OPENAI_MODEL: 'bureau/pirate' },
    })
    let texte = ''
    enfant.stdout.on('data', (morceau) => (texte += morceau))
    enfant.on('close', () => fini(texte))
  })
  serveur.close()
  assert.equal(requetes.length, 1)
  assert.equal(requetes[0].autorisation, null)
  assert.equal(requetes[0].corps.model, 'bureau/pirate')
  assert.match(sortie, /"subtype":"success"/)
})

test('une passerelle qui redirige : la requête et la clé ne partent jamais vers l’adresse de destination', async () => {
  const home = mkdtempSync(join(tmpdir(), 'glm-ada-home-'))
  const cible = []
  const destination = createServer((requete, reponse) => {
    cible.push(requete.headers.authorization ?? null)
    reponse.end('{}')
  })
  await new Promise((pret) => destination.listen(0, '127.0.0.1', pret))
  const passerelle = createServer((requete, reponse) => {
    reponse.statusCode = 302
    reponse.setHeader('Location', `http://127.0.0.1:${destination.address().port}/v1/chat/completions`)
    reponse.end()
  })
  await new Promise((pret) => passerelle.listen(0, '127.0.0.1', pret))
  const sortie = await new Promise((fini) => {
    const enfant = spawn('node', [fileURLToPath(new URL('./runner.mjs', import.meta.url)), '-p', 'salut', '--model', 'perso', '--no-session-persistence'], {
      env: { ...process.env, HOME: home, OPENAI_BASE_URL: `http://127.0.0.1:${passerelle.address().port}/v1`, OPENAI_API_KEY: 'CLE-PERSO', OPENAI_MODEL: 'perso' },
    })
    let texte = ''
    enfant.stdout.on('data', (morceau) => (texte += morceau))
    enfant.on('close', () => fini(texte))
  })
  passerelle.close()
  destination.close()
  assert.deepEqual(cible, [])
  assert.doesNotMatch(sortie, /"subtype":"success"/)
})

test('réessai : respecte Retry-After, sinon double le délai jusqu’à 30 s', () => {
  assert.equal(retryDelay(1, '7'), 7000)
  assert.equal(retryDelay(1, '500'), 60000, 'plafonné à 60 s')
  assert.equal(retryDelay(1, '', 0), 2000)
  assert.equal(retryDelay(3, '', 0), 8000)
  assert.equal(retryDelay(6, '', 0), 30000, 'plafonné à 30 s')
  assert.equal(retryDelay(2, 'abc', 0), 4000, 'Retry-After illisible : délai par défaut')
})
