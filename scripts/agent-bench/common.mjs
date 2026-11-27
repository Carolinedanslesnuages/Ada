// Shared part of the agent's test bench: settings, launching the agent as the API does, disposable project.
import { spawn } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const API = join(ROOT, 'interface/api')
const COMPILED_CONFIG = join(API, 'dist/config.js')
const { SKILLS_SHIPPED_WITH_ADA = '' } = existsSync(COMPILED_CONFIG) ? await import(COMPILED_CONFIG) : {}

/** ADA's code, compiled: the bench uses the SAME instructions, tools and options as the API. */
export async function loadApi() {
  const agent = join(API, 'dist/agent/agent.js')
  if (!existsSync(agent)) {
    console.error('Compilez d’abord l’API : cd interface/api && npm run build')
    process.exit(1)
  }
  // The agent is split by responsibility (ADR-0012): the bench gathers its modules.
  const modules = ['agent', 'instructions', 'tools', 'responses', 'activity', 'breakdown-retry', 'injection-guard', 'pending-commit'].map((name) => import(join(API, `dist/agent/${name}.js`)))
  return { agent: Object.assign({}, ...(await Promise.all(modules))), footprint: await import(join(API, 'dist/footprint/footprint.js')), adaConfig: await import(join(API, 'dist/ada/ada-config.js')) }
}

const develop = (filePath) => (filePath.startsWith('~') ? join(homedir(), filePath.slice(1)) : filePath)

/**
 * Agent settings: those of interface/api/.env (ONLY the three useful ones, never the secrets),
 * replaceable by BENCH_COMMAND, BENCH_MODEL and BENCH_SKILLS (folders separated by commas).
 */
export function readSettings() {
  const readFiles = {}
  const file = join(API, '.env')
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const found = /^(AGENT_SKILLS|AGENT_COMMAND|AGENT_MODEL)=(.*)$/.exec(line.trim())
      if (found) readFiles[found[1]] = found[2].trim()
    }
  }
  // Without AGENT_SKILLS in .env, the API ships the external skills of the submodules: the bench reads the
  // SAME list in the compiled API (SKILLS_SHIPPED_WITH_ADA), so as never to test another configuration.
  const delivered = SKILLS_SHIPPED_WITH_ADA.split(',').map((filePath) => join(API, filePath)).join(',')
  const folders = (process.env.BENCH_SKILLS ?? readFiles.AGENT_SKILLS ?? delivered)
    .split(',')
    .map((filePath) => develop(filePath.trim()))
    .filter((filePath) => filePath && existsSync(join(filePath, 'SKILL.md')))
    .map((filePath) => realpathSync(filePath))
  return {
    command: develop(process.env.BENCH_COMMAND ?? readFiles.AGENT_COMMAND ?? 'claude'),
    template: process.env.BENCH_MODEL ?? (readFiles.AGENT_MODEL || 'sonnet'),
    skills: folders.map((folder) => ({ name: basename(folder), folder })),
  }
}

export const readRgaaIndex = () => readFileSync(join(ROOT, 'skills/po/po-story/references/rgaa-4.1.2/README.md'), 'utf8')

/** Copies the common base then the template on top (without node_modules), as when a project is created. */
export function copyTemplate(template, folder) {
  for (const source of ['socle', template]) {
    cpSync(join(ROOT, 'catalogue', source), folder, { recursive: true, filter: (filePath) => !filePath.includes('node_modules') })
  }
}

/**
 * A skill being read: through its real folder, or through the link the instructions give in the project
 * (.claude/skills/<name>/ or .agents/skills/<name>/, relative or absolute path). Without this second case, a
 * read done as the instructions ask was not counted.
 */
export function isSkillRead(filePath, skill) {
  if (!filePath) return false
  if (filePath.includes(skill.folder)) return true
  return filePath.replaceAll('\\', '/').split('/').some((_, rank, parts) => (parts[rank] === '.claude' || parts[rank] === '.agents') && parts[rank + 1] === 'skills' && parts[rank + 2] === skill.name)
}

/** Disposable copy of a catalog template, with the skills linked as the API does, and the files of the case (booby-trapped, for example). */
export function disposableProject(template, skills, files = {}) {
  const folder = join(mkdtempSync(join(tmpdir(), 'banc-ada-')), 'projet')
  copyTemplate(template, folder)
  equipSkills(folder, skills)
  writeFiles(folder, files)
  return folder
}

/** Writes (or replaces) files of a disposable project: `{ 'AGENTS.md': '…' }`. */
export function writeFiles(folder, files = {}) {
  for (const [filePath, content] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, filePath)), { recursive: true })
    writeFileSync(join(folder, filePath), content)
  }
}

export function equipSkills(folder, skills) {
  for (const root of ['.claude/skills', '.agents/skills']) {
    mkdirSync(join(folder, root), { recursive: true })
    for (const skill of skills) if (!existsSync(join(folder, root, skill.name))) symlinkSync(skill.folder, join(folder, root, skill.name))
  }
  const exclusions = join(folder, '.git/info/exclude')
  if (existsSync(dirname(exclusions))) appendFileSync(exclusions, '/.claude/skills/\n/.agents/skills/\n')
}

/** Launches the agent like the API (isolation options, tools of the phase) and follows what it does. */
export function launchAgent({ api, settings, phase, instructions, cwd, turns, delayMs = 900_000 }) {
  const { agent, footprint } = api
  const args = [
    '-p', instructions, '--output-format', 'stream-json', '--verbose', '--model', settings.template, '--max-turns', String(turns),
    ...agent.ISOLATION_OPTIONS, '--no-session-persistence',
    '--disallowedTools', ...agent.FORBIDDEN_TOOLS,
    '--allowedTools', ...agent.allowedTools(phase, settings.skills.map((skill) => skill.folder)),
  ]
  // Like the API: the agent never receives the secrets of the environment.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/SECRET|TOKEN|KEY|PASSWORD/i.test(name)))
  const start = Date.now()
  return new Promise((resolvePromise) => {
    const tracking = { result: '', usages: [], turns: 0, skills: new Set(), tools: {} }
    const processes = spawn(settings.command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => processes.kill('SIGTERM'), delayMs)
    let buffer = ''
    processes.stdout.on('data', (piece) => {
      buffer += piece
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          if (event.type === 'assistant') {
            tracking.turns++
            for (const block of event.message?.content ?? []) {
              if (block.type !== 'tool_use') continue
              tracking.tools[block.name] = (tracking.tools[block.name] ?? 0) + 1
              if (block.name === 'Skill') tracking.skills.add(String(block.input?.skill ?? '?'))
              const readPath = String(block.input?.file_path ?? '')
              for (const skill of settings.skills) if (isSkillRead(readPath, skill)) tracking.skills.add(skill.name)
            }
          }
          if (event.type === 'result') {
            tracking.result = event.result ?? ''
            tracking.usages = footprint.readUsages(event.modelUsage)
          }
        } catch {
          /* line that is not JSON: ignored */
        }
      }
    })
    processes.on('error', (error) => {
      clearTimeout(timer)
      resolvePromise({ ...tracking, skills: [], seconds: 0, error: error.message })
    })
    processes.on('close', () => {
      clearTimeout(timer)
      const e = footprint.footprint(tracking.usages)
      resolvePromise({ ...tracking, skills: [...tracking.skills], seconds: Math.round((Date.now() - start) / 1000), outputTokenCount: e.outputTokenCount, co2Grams: (e.co2Grams.min + e.co2Grams.max) / 2 })
    })
  })
}

export const average = (values) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0)

/** Runs tasks with at most `parallel` at the same time (like AGENT_MAX_CONCURRENT). */
export async function inParallel(tasks, parallel, run) {
  let suivante = 0
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (suivante < tasks.length) await run(tasks[suivante++])
  }))
}
