#!/usr/bin/env node
// Coding agent for ADA that talks to an OpenAI-compatible gateway (for example the office GLM-5),
// without Claude Code. It takes the Claude Code options ADA uses (-p, --model, --max-turns,
// --allowedTools, --disallowedTools, --session-id, --resume…) and writes the same “stream-json” output,
// so that ADA has nothing to change. Configuration: ~/.config/glm-ada/env (never in the repository).
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { glob, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

const CWD = process.cwd()
const OUTPUT_LIMIT = 30000
const CONFIG_DIR = join(homedir(), '.config', 'glm-ada')

// ---------- Arguments ----------
export function parseArgs(argv) {
  const opts = { prompt: '', model: '', maxTurns: 30, allowed: [], denied: [], sessionId: null, summary: null, persist: true }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    switch (arg) {
      case '-p':
      case '--print':
        opts.prompt = argv[++index] ?? ''
        break
      case '--output-format':
      case '--setting-sources':
        index++
        break
      case '--model':
        opts.model = argv[++index] ?? ''
        break
      case '--max-turns':
        opts.maxTurns = Number(argv[++index]) || opts.maxTurns
        break
      case '--session-id':
        opts.sessionId = argv[++index] ?? null
        break
      case '--resume':
        opts.summary = argv[++index] ?? null
        break
      case '--no-session-persistence':
        opts.persist = false
        break
      case '--allowedTools':
      case '--disallowedTools': {
        const list = arg === '--allowedTools' ? opts.allowed : opts.denied
        while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) list.push(argv[++index])
        break
      }
      default:
        break // --verbose, --strict-mcp-config and the unknown options
    }
  }
  return opts
}

// ---------- Permissions ----------
const globToRegex = (pattern, wildcard) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, wildcard).replace(/\u0000/g, '.*')}$`, 's')

export function parseRule(rule) {
  const match = /^(\w+)(?:\(([\s\S]*)\))?$/.exec(rule.trim())
  return match ? { tool: match[1], pattern: match[2] ?? null } : null
}

function pathMatches(pattern, absolute, cwd) {
  if (pattern.startsWith('//')) return globToRegex(pattern.slice(1), '[^/]*').test(absolute)
  const rel = relative(cwd, absolute)
  if (rel.startsWith('..') || rel === '') return rel === '' && /^(\.\/)?\*\*$/.test(pattern)
  const local = pattern.replace(/^\.\//, '').replace(/^\//, '')
  return globToRegex(local, '[^/]*').test(rel)
}

/** A command that chains, redirects or substitutes (outside single quotes) is never accepted. */
export function hasShellOperators(command) {
  let quote = null
  for (const char of command) {
    if (quote === "'") {
      if (char === "'") quote = null
      continue
    }
    if (quote === '"') {
      if (char === '"') quote = null
      else if (char === '$' || char === '`' || char === '\\') return true
      continue
    }
    if (char === "'" || char === '"') quote = char
    else if (/[;&|`<>$()\\\n\r]/.test(char)) return true
  }
  return quote !== null
}

export function makePermissions(allowed, denied, cwd = CWD) {
  const allowRules = allowed.map(parseRule).filter(Boolean)
  const denyRules = denied.map(parseRule).filter(Boolean)
  const specMatches = (rule, tool, spec) => {
    if (rule.pattern === null) return true
    if (tool === 'Bash') return !hasShellOperators(spec) && globToRegex(rule.pattern, '.*').test(spec)
    if (['Read', 'Edit', 'Write', 'Glob', 'Grep'].includes(tool)) {
      if (!pathMatches(rule.pattern, spec, cwd)) return false
      // A link that leaves the project must not bypass the rule: it is checked again on the real path.
      const real = existsSync(spec) ? realpathSync(spec) : null
      return real === null || real === spec || pathMatches(rule.pattern, real, cwd)
    }
    return false
  }
  return {
    offered: (tool) => allowRules.some((rule) => rule.tool === tool),
    permit(tool, spec) {
      if (denyRules.some((rule) => rule.tool === tool && specMatches(rule, tool, spec))) return false
      return allowRules.some((rule) => rule.tool === tool && specMatches(rule, tool, spec))
    },
  }
}

// ---------- Tools ----------
const truncate = (text) => (text.length > OUTPUT_LIMIT ? `${text.slice(0, OUTPUT_LIMIT)}\n[… tronqué : ${text.length} caractères]` : text)
const absolutePath = (value) => resolve(CWD, String(value ?? ''))

function runProcess(command, args, options = {}) {
  return new Promise((done) => {
    const env = { ...process.env }
    for (const key of Object.keys(env)) if (/^OPENAI_/.test(key)) delete env[key]
    const child = spawn(command, args, { cwd: options.cwd ?? CWD, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const collect = (chunk) => {
      if (output.length < OUTPUT_LIMIT * 2) output += chunk.toString('utf8')
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 120000)
    child.on('error', (error) => done({ code: 1, output: String(error) }))
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ code: code ?? 1, output })
    })
  })
}

async function skillList() {
  const skills = []
  for (const root of ['.claude/skills', '.agents/skills']) {
    for (const name of await readdir(join(CWD, root)).catch(() => [])) {
      const content = await readFile(join(CWD, root, name, 'SKILL.md'), 'utf8').catch(() => null)
      if (content === null) continue
      const description = /^description:\s*(.+)$/m.exec(content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '')?.[1] ?? ''
      skills.push({ name, description: description.trim(), path: join(CWD, root, name, 'SKILL.md') })
    }
  }
  return skills
}

const TOOL_DEFINITIONS = {
  Read: { description: 'Lit un fichier (numéroté). Chemin relatif au dossier courant ou absolu autorisé.', properties: { file_path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['file_path'] },
  Write: { description: 'Crée ou remplace un fichier avec le contenu donné.', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] },
  Edit: { description: 'Remplace un texte exact (old_string) par un autre (new_string) dans un fichier. old_string doit être unique, sauf replace_all.', properties: { file_path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' }, replace_all: { type: 'boolean' } }, required: ['file_path', 'old_string', 'new_string'] },
  Glob: { description: 'Liste les fichiers qui correspondent à un motif (ex. src/**/*.ts).', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] },
  Grep: { description: 'Cherche une expression régulière dans les fichiers (numéros de ligne).', properties: { pattern: { type: 'string' }, path: { type: 'string' }, glob: { type: 'string' } }, required: ['pattern'] },
  Bash: { description: 'Exécute une commande (une seule, sans enchaînement ni redirection) et renvoie sa sortie.', properties: { command: { type: 'string' } }, required: ['command'] },
  Skill: { description: 'Charge les instructions d’une méthode (skill) par son nom.', properties: { skill: { type: 'string' } }, required: ['skill'] },
}

/** Runs a tool; returns the text for the model. A denied permission is a result, never an exception. */
export async function executeTool(name, input, permissions) {
  const refused = (what) => `Refusé : ${name} n’est pas autorisé sur ${what}. Ne réessaie pas ; choisis une autre approche.`
  try {
    switch (name) {
      case 'Read': {
        const file = absolutePath(input.file_path)
        if (!permissions.permit('Read', file)) return refused(input.file_path)
        const lines = (await readFile(file, 'utf8')).split('\n')
        const start = Math.max(0, Number(input.offset) || 0)
        const slice = lines.slice(start, start + (Number(input.limit) || 2000))
        return truncate(slice.map((line, index) => `${String(start + index + 1).padStart(6)}\t${line}`).join('\n'))
      }
      case 'Write': {
        const file = absolutePath(input.file_path)
        if (!permissions.permit('Write', file)) return refused(input.file_path)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, String(input.content ?? ''))
        return `Fichier écrit : ${input.file_path}`
      }
      case 'Edit': {
        const file = absolutePath(input.file_path)
        if (!permissions.permit('Edit', file)) return refused(input.file_path)
        const current = await readFile(file, 'utf8')
        const oldText = String(input.old_string ?? '')
        const count = oldText ? current.split(oldText).length - 1 : 0
        if (count === 0) return 'Erreur : old_string introuvable dans le fichier (le texte doit correspondre exactement).'
        if (count > 1 && !input.replace_all) return `Erreur : old_string apparaît ${count} fois ; précise-le ou utilise replace_all.`
        await writeFile(file, input.replace_all ? current.split(oldText).join(String(input.new_string ?? '')) : current.replace(oldText, () => String(input.new_string ?? '')))
        return `Fichier modifié : ${input.file_path}`
      }
      case 'Glob': {
        const base = absolutePath(input.path ?? '.')
        if (!permissions.permit('Glob', base) || String(input.pattern).split('/').includes('..')) return refused(input.path ?? '.')
        const found = []
        const exclude = (entry) => ['node_modules', '.git'].includes(basename(String(entry?.name ?? entry)))
        for await (const entry of glob(String(input.pattern), { cwd: base, exclude })) {
          found.push(entry)
          if (found.length >= 500) break
        }
        return found.sort().join('\n') || 'Aucun fichier.'
      }
      case 'Grep': {
        const base = absolutePath(input.path ?? '.')
        if (!permissions.permit('Grep', base)) return refused(input.path ?? '.')
        const args = ['-rnE', '--exclude-dir=node_modules', '--exclude-dir=.git', '-m', '200']
        if (input.glob) args.push(`--include=${input.glob}`)
        args.push('-e', String(input.pattern), '--', relative(CWD, base) || '.')
        const result = await runProcess('grep', args)
        return result.output.trim() ? truncate(result.output) : 'Aucun résultat.'
      }
      case 'Bash': {
        const command = String(input.command ?? '')
        if (!permissions.permit('Bash', command)) return refused(`la commande « ${command.slice(0, 80)} »`)
        const result = await runProcess('/bin/bash', ['-c', command])
        return truncate(`${result.output}\n[code de sortie : ${result.code}]`)
      }
      case 'Skill': {
        const skill = (await skillList()).find((candidate) => candidate.name === input.skill)
        if (!skill) return `Skill inconnue : ${input.skill}`
        return truncate(await readFile(skill.path, 'utf8'))
      }
      default:
        return `Outil inconnu : ${name}`
    }
  } catch (error) {
    return `Erreur : ${error.message}`
  }
}

// ---------- Configuration and model call ----------
function readEnvFile(file) {
  const config = {}
  if (!existsSync(file)) return config
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (match && !line.trim().startsWith('#')) config[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return config
}

/**
 * Choice of the model, without restriction: AGENT_MODEL (--model option) can be any name,
 * passed as is to the gateway. “profile/model” also chooses another gateway, described
 * in ~/.config/glm-ada/<profile>.env (e.g. “ollama/qwen3.6:35b”, “bureau/glm-5”). Without a profile,
 * it is ~/.config/glm-ada/env.
 */
export function resolveModel(requested, configDir = CONFIG_DIR) {
  const slash = requested.indexOf('/')
  const profile = slash > 0 ? requested.slice(0, slash) : ''
  if (profile && /^[\w-]+$/.test(profile) && existsSync(join(configDir, `${profile}.env`))) {
    return { file: join(configDir, `${profile}.env`), model: requested.slice(slash + 1) }
  }
  return { file: join(configDir, 'env'), model: requested }
}

export function loadConfig(file) {
  const config = file ? readEnvFile(file) : {}
  return {
    baseUrl: process.env.OPENAI_BASE_URL || config.OPENAI_BASE_URL || '',
    apiKey: process.env.OPENAI_API_KEY || config.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || config.OPENAI_MODEL || '',
    // Optional: some (reasoning) models refuse the temperature; it is only sent if requested.
    temperature: config.OPENAI_TEMPERATURE ?? process.env.OPENAI_TEMPERATURE ?? '',
    maxTokens: config.OPENAI_MAX_TOKENS ?? process.env.OPENAI_MAX_TOKENS ?? '',
  }
}

const MAX_ATTEMPTS = 6

/** Wait before retrying: the gateway's Retry-After header (in seconds) if it gives one, otherwise a delay that doubles (2, 4, 8… 30 s). */
export function retryDelay(attempt, retryAfter = '', jitter = Math.random()) {
  const asked = Number(retryAfter)
  if (retryAfter !== '' && Number.isFinite(asked) && asked >= 0) return Math.min(asked, 60) * 1000
  return Math.min(30000, 2000 * 2 ** (attempt - 1)) + Math.floor(jitter * 1000)
}

async function callModel(config, model, messages, tools) {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  let retryAfter = ''
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
        body: JSON.stringify({
          model,
          messages,
          ...(tools.length ? { tools } : {}),
          ...(config.temperature !== '' ? { temperature: Number(config.temperature) } : {}),
          ...(config.maxTokens !== '' ? { max_tokens: Number(config.maxTokens) } : {}),
        }),
        signal: AbortSignal.timeout(300000),
        // A gateway that redirects could send the request (and the key) elsewhere, to the server's network.
        redirect: 'manual',
      })
      if (response.ok) return await response.json()
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= MAX_ATTEMPTS) throw new Error(`La passerelle a répondu ${response.status} : ${(await response.text()).slice(0, 300)}`)
      retryAfter = response.headers.get('retry-after') ?? ''
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || String(error.message).startsWith('La passerelle')) throw error
    }
    await new Promise((wait) => setTimeout(wait, retryDelay(attempt, retryAfter)))
    retryAfter = ''
  }
}

// ---------- Session ----------
const sessionFile = (id) => join(homedir(), '.local', 'state', 'glm-ada', 'sessions', `${String(id).replace(/[^\w-]/g, '_')}.json`)

async function systemPrompt() {
  const skills = await skillList()
  const notes = []
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const content = await readFile(join(CWD, name), 'utf8').catch(() => null)
    if (content) notes.push(`## ${name}\n${content.slice(0, 20000)}`)
  }
  return [
    `Tu es un agent de code autonome. Tu travailles dans le dossier courant (${CWD}), un projet git.`,
    'Tu disposes d’outils : utilise-les pour agir réellement (lire, écrire, lancer les tests). Ne te contente jamais d’expliquer ce qu’il faudrait faire, et n’invente jamais le résultat d’une commande : lance-la.',
    'Les chemins sont relatifs au dossier courant. Si un outil répond « Refusé », ne réessaie pas la même chose.',
    'Quand le travail est terminé, réponds par un court compte rendu, en français.',
    skills.length ? `Méthodes disponibles (outil Skill) :\n${skills.map((skill) => `- ${skill.name} : ${skill.description}`).join('\n')}` : '',
    ...notes,
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ---------- Main loop ----------
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`)

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  // Gateway imposed by the caller (OPENAI_BASE_URL in the environment: personal model of an ADA user):
  // no file of ~/.config/glm-ada is read, neither profile nor administrator key, which must never go to
  // an address chosen by someone else.
  const enforced = Boolean(process.env.OPENAI_BASE_URL)
  const choice = enforced ? { file: null, model: opts.model } : resolveModel(opts.model)
  const config = loadConfig(choice.file)
  const model = choice.model || config.model
  const finish = (subtype, text, code, usage = {}) => {
    emit({ type: 'result', subtype, is_error: subtype !== 'success', result: text, modelUsage: { [model]: usage } })
    process.exit(code)
  }
  if (!config.baseUrl) finish('error', `Passerelle non configurée : renseignez OPENAI_BASE_URL dans ${choice.file ?? 'l’environnement'}.`, 1)
  if (!model) finish('error', `Aucun modèle : renseignez AGENT_MODEL dans le .env d’ADA, ou OPENAI_MODEL dans ${choice.file ?? 'l’environnement'}.`, 1)

  const permissions = makePermissions(opts.allowed, opts.denied)
  const tools = Object.entries(TOOL_DEFINITIONS)
    .filter(([name]) => permissions.offered(name))
    .map(([name, def]) => ({ type: 'function', function: { name, description: def.description, parameters: { type: 'object', properties: def.properties, required: def.required } } }))

  const id = opts.summary ?? opts.sessionId
  let messages = []
  if (opts.summary && existsSync(sessionFile(opts.summary))) messages = JSON.parse(await readFile(sessionFile(opts.summary), 'utf8'))
  if (messages.length === 0) messages.push({ role: 'system', content: await systemPrompt() })
  messages.push({ role: 'user', content: opts.prompt })
  emit({ type: 'system', subtype: 'init', cwd: CWD, model, tools: tools.map((tool) => tool.function.name) })

  const usage = { inputTokens: 0, outputTokens: 0 }
  // Debugging (GLM_ADA_DEBUG=1): the whole exchange of this run, in ~/.local/state/glm-ada/runs/ (never the key).
  const debugFile = process.env.GLM_ADA_DEBUG ? join(homedir(), '.local', 'state', 'glm-ada', 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.json`) : null
  const save = async () => {
    if (debugFile) {
      await mkdir(dirname(debugFile), { recursive: true })
      await writeFile(debugFile, JSON.stringify({ model, args: process.argv.slice(2).map((arg) => arg.slice(0, 200)), messages }, null, 1))
    }
    if (opts.persist && id) {
      await mkdir(dirname(sessionFile(id)), { recursive: true })
      await writeFile(sessionFile(id), JSON.stringify(messages))
    }
  }
  let lastText = ''
  try {
    for (let turn = 1; turn <= opts.maxTurns; turn++) {
      const reply = await callModel(config, model, messages, tools)
      usage.inputTokens += reply.usage?.prompt_tokens ?? 0
      usage.outputTokens += reply.usage?.completion_tokens ?? 0
      const message = reply.choices?.[0]?.message
      if (!message) throw new Error('Réponse de la passerelle inattendue (pas de choix).')
      messages.push({ role: 'assistant', content: message.content ?? '', ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) })
      if (message.content) lastText = message.content
      const calls = message.tool_calls ?? []
      // Like Claude Code: one event per block (text, then each tool call). ADA records each
      // event in its activity log; several calls in a single event would be written at the same time.
      if (message.content) emit({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: message.content }] } })
      for (const call of calls) {
        let input = {}
        try {
          input = JSON.parse(call.function?.arguments || '{}')
        } catch {
          /* invalid arguments: the tool will answer with an error */
        }
        emit({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: call.id, name: call.function?.name, input }] } })
      }
      if (calls.length === 0) {
        await save()
        finish('success', message.content ?? '', 0, usage)
      }
      for (const call of calls) {
        let input
        let output
        try {
          input = JSON.parse(call.function?.arguments || '{}')
          output = await executeTool(call.function?.name, input, permissions)
        } catch {
          output = 'Erreur : les arguments de l’outil ne sont pas du JSON valide.'
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: output })
        emit({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: output.slice(0, 2000) }] } })
      }
    }
    await save()
    finish('error_max_turns', lastText || 'Nombre maximum de tours atteint.', 0, usage)
  } catch (error) {
    await save().catch(() => {})
    finish('error', lastText || `Erreur : ${error.message}`, 1, usage)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
