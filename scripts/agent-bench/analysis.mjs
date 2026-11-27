#!/usr/bin/env node
// Test bench of the agent's ANALYSIS phase: for each request, the right decision (questions, plan,
// breakdown, waiting)? Same instructions, same tools and same options as the API; disposable project, read-only,
// nothing is written to GitHub.
//
// Usage: node scripts/agent-bench/analysis.mjs [case ...] [--dry-run]
//   BENCH_REPS=5   repetitions of each case (the agent is not deterministic: 5 gives a measure)
//   --dry-run      builds the instructions without calling the agent (no cost): checks that the bench holds
import { ANALYSIS_CASES } from './cases.mjs'
import { loadApi, inParallel, launchAgent, readRgaaIndex, readSettings, average, disposableProject } from './common.mjs'

const api = await loadApi()
const { analysisInstructions, readDecision, isLargeWorkRequest, breakdownRetry, readInstructionFiles, isCopiedFromFile, SUSPICIOUS_FILE_RETRY } = api.agent
const settings = readSettings()
const dryRun = process.argv.includes('--dry-run')
const workRequests = process.argv.slice(2).filter((argument) => !argument.startsWith('--'))
const chosen = workRequests.length ? workRequests : Object.keys(ANALYSIS_CASES)
const unknown = chosen.filter((name) => !ANALYSIS_CASES[name])
if (unknown.length) {
  console.error(`Cas inconnus : ${unknown.join(', ')}. Cas possibles : ${Object.keys(ANALYSIS_CASES).join(', ')}`)
  process.exit(1)
}
const repetitions = Number(process.env.BENCH_REPS || 1)
const rgaa = readRgaaIndex()
const instructionsFor = (name) => analysisInstructions(ANALYSIS_CASES[name].workRequest, rgaa, settings.skills.map((skill) => skill.name), true)

if (dryRun) {
  for (const name of chosen) console.log(`${name.padEnd(14)} consigne de ${instructionsFor(name).length} caractères`)
  console.log(`\nÀ blanc : ${chosen.length} cas, modèle ${settings.template}, ${settings.skills.length} skill(s) reliée(s). Rien n'a été lancé.`)
  process.exit(0)
}

/** The checks of a case: deliberately simple, they judge the behaviour and not the wording. */
function record(name, result) {
  const benchCase = ANALYSIS_CASES[name]
  const decision = readDecision(result)
  const checks = [['JSON lisible', Boolean(decision)]]
  if (!decision) return { decision, checks }
  checks.push([`décision parmi ${benchCase.expected.join('/')}`, benchCase.expected.includes(decision.decision)])
  if (benchCase.mustQuote) checks.push([`cite la demande concernée (${benchCase.mustQuote})`, benchCase.mustQuote.test(decision.text)])
  if (benchCase.forbidden) checks.push(['ne dit pas ce qu’il ne doit pas dire', !benchCase.forbidden.test(decision.text)])
  if (benchCase.obeys) checks.push(['n’obéit pas à la consigne piégée', !benchCase.obeys(decision)])
  if (decision.decision === 'questions') checks.push(['trois questions au plus', (decision.choice?.length ?? 0) <= 3])
  checks.push(['texte bref (1500 caractères au plus)', decision.text.length <= 1500])
  return { decision, checks }
}

const tasks = chosen.flatMap((name) => Array.from({ length: repetitions }, (_, rank) => ({ name, rank })))
const completed = []
await inParallel(tasks, 3, async ({ name, rank }) => {
  const cwd = disposableProject('pwa', settings.skills, ANALYSIS_CASES[name].files)
  let execution = await launchAgent({ api, settings, phase: 'analysis', instructions: instructionsFor(name), cwd, turns: 30 })
  // Like the API: a large request that gets questions is relaunched once as a breakdown.
  const first = readDecision(execution.result)
  if (first?.decision === 'questions' && isLargeWorkRequest(ANALYSIS_CASES[name].workRequest, first.text)) {
    execution = await launchAgent({ api, settings, phase: 'analysis', instructions: instructionsFor(name) + breakdownRetry(first.text), cwd, turns: 30 })
    if (readDecision(execution.result)?.decision !== 'breakdown') execution = { ...execution, result: JSON.stringify(first) }
  }
  // Like the API: an answer copied as is from a project file is refused, relaunched once, then blocked.
  const instructionFiles = await readInstructionFiles(cwd)
  const isSuspicious = (result) => { const parsed = readDecision(result); return Boolean(parsed) && isCopiedFromFile(parsed.text, instructionFiles) }
  if (isSuspicious(execution.result)) {
    execution = await launchAgent({ api, settings, phase: 'analysis', instructions: instructionsFor(name) + SUSPICIOUS_FILE_RETRY, cwd, turns: 30 })
    if (isSuspicious(execution.result)) execution = { ...execution, result: '' }
  }
  const { decision, checks } = record(name, execution.result)
  completed.push({ name, decision: decision?.decision ?? null, checks, ...execution })
  process.stderr.write(`· ${name} ${rank + 1}/${repetitions} : ${decision?.decision ?? 'illisible'}\n`)
  if (!decision) process.stderr.write(`  ↳ réponse illisible : ${JSON.stringify(String(execution.result ?? '').slice(0, 220))}\n`)
})

console.log(`\nAnalyse — modèle ${settings.template}, ${repetitions} répétition(s) par cas\n`)
let succeeded = 0
for (const name of chosen) {
  const lines = completed.filter((done) => done.name === name)
  const green = lines.filter((done) => done.checks.every(([, ok]) => ok)).length
  const decisions = {}
  for (const done of lines) decisions[done.decision ?? 'illisible'] = (decisions[done.decision ?? 'illisible'] ?? 0) + 1
  const failures = [...new Set(lines.flatMap((done) => done.checks.filter(([, ok]) => !ok).map(([label]) => label)))]
  console.log(`${green === lines.length ? '✔' : '✘'} ${name.padEnd(14)} ${green}/${lines.length} | ${JSON.stringify(decisions)}${failures.length ? ` | échecs : ${failures.join(' ; ')}` : ''}`)
  succeeded += green
}
const tokens = completed.reduce((sum, done) => sum + (done.outputTokenCount ?? 0), 0)
const co2 = completed.reduce((sum, done) => sum + (done.co2Grams ?? 0), 0)
console.log(`\nBilan : ${succeeded}/${completed.length} exécutions entièrement réussies`)
console.log(`Durée moyenne ${average(completed.map((done) => done.seconds))} s | skills invoquées : ${JSON.stringify(completed.flatMap((done) => done.skills))}`)
console.log(`Coût : ${tokens} tokens produits, environ ${Math.round(co2)} g CO2e (estimation d'ADA)`)
process.exitCode = succeeded === completed.length ? 0 : 1
