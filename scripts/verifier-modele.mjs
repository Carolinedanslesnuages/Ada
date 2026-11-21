#!/usr/bin/env node
// Vérifie un modèle du catalogue comme le ferait son propre projet : installation des dépendances
// (npm ci ; pour Python : environnement virtuel .venv-verification et pip) dans chaque dossier
// déclaré par ada.json, puis chacun de ses contrôles (lint, types,
// tests dont accessibilité, compilation), sur le projet assemblé (socle commun puis modèle) dans un
// dossier jetable. Les chemins /app du conteneur deviennent ce dossier.
// Vérifie d'abord que chaque fichier contenant un repère (__SLUG__, __NOM_PROJET__…) est listé dans
// « personnaliser » : sinon le repère resterait tel quel dans le projet créé (tests faux).
// Vérifie aussi qu'aucun fichier ne recopie à l'identique le socle commun (catalogue/socle/), et que
// les dépendances npm sont en version exacte.
// Usage : node scripts/verifier-modele.mjs <modèle>      (ex. : vue-nest-dsfr, maquette)
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const modele = process.argv[2]
const dossier = resolve('catalogue', modele ?? '')
if (!modele || !existsSync(join(dossier, 'ada.json'))) {
  console.error(`Modèle introuvable : catalogue/${modele ?? '?'}/ada.json`)
  process.exit(1)
}
const ada = JSON.parse(readFileSync(join(dossier, 'ada.json'), 'utf8'))
const REPERES = /__(NOM_PROJET|BASELINE|SLUG|OBJECTIF|DATE|PO)__/
const suivis = execFileSync('git', ['ls-files', '-z', '--', dossier], { encoding: 'utf8' }).split('\0').filter(Boolean)
const oublies = suivis
  .map((fichier) => relative(dossier, resolve(fichier)))
  .filter((fichier) => fichier !== 'ada.json' && !(ada.personnaliser ?? []).includes(fichier))
  .filter((fichier) => REPERES.test(readFileSync(join(dossier, fichier), 'utf8')))
if (oublies.length) {
  console.error(`✘ Repères non remplacés à la création : ajoutez à « personnaliser » de ada.json :\n  ${oublies.join('\n  ')}`)
  process.exit(1)
}
console.log(`✔ Fichiers à personnaliser : complets`)
// Le socle commun (catalogue/socle/) est copié avant le modèle : un modèle ne le recopie pas à
// l'identique (deux copies finissent par diverger), il ne fait que le remplacer quand il diffère.
const socle = resolve('catalogue', 'socle')
const doublons = suivis
  .map((fichier) => relative(dossier, resolve(fichier)))
  .filter((fichier) => existsSync(join(socle, fichier)) && readFileSync(join(socle, fichier)).equals(readFileSync(join(dossier, fichier))))
if (doublons.length) {
  console.error(`✘ Fichiers identiques au socle commun : supprimez-les du modèle (le socle les apporte) :\n  ${doublons.join('\n  ')}`)
  process.exit(1)
}
console.log(`✔ Aucun doublon du socle commun`)
// Dépendances npm en version exacte (contrôle « Dépendances » des projets), et « npm install »
// qui continue d'écrire des versions exactes (.npmrc).
const VERSION_EXACTE = /^\d+\.\d+\.\d+(-[\w.]+)?$/
const libres = []
for (const sousDossier of ada.apercu?.npm ?? []) {
  const paquet = JSON.parse(readFileSync(join(dossier, sousDossier, 'package.json'), 'utf8'))
  const dependances = { ...paquet.dependencies, ...paquet.devDependencies, ...paquet.optionalDependencies }
  for (const [nom, version] of Object.entries(dependances)) {
    if (!VERSION_EXACTE.test(version)) libres.push(`${join(sousDossier, 'package.json')} : ${nom}@${version}`)
  }
  const npmrc = join(dossier, sousDossier, '.npmrc')
  if (!existsSync(npmrc) || !/^save-exact=true$/m.test(readFileSync(npmrc, 'utf8'))) libres.push(`${join(sousDossier, '.npmrc')} : save-exact=true manquant`)
}
if (libres.length) {
  console.error(`✘ Versions de dépendances non exactes :\n  ${libres.join('\n  ')}`)
  process.exit(1)
}
console.log(`✔ Dépendances en version exacte`)
// Les contrôles tournent sur le projet tel qu'un PO le reçoit : socle commun, puis le modèle
// par-dessus (comme à la création), dans un dossier jetable.
const projet = mkdtempSync(join(tmpdir(), `verifier-${modele}-`))
const fichiersDe = (source) => execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'], { cwd: source, encoding: 'utf8' }).split('\0').filter(Boolean)
for (const source of [socle, dossier]) {
  for (const fichier of fichiersDe(source)) {
    mkdirSync(dirname(join(projet, fichier)), { recursive: true })
    copyFileSync(join(source, fichier), join(projet, fichier))
  }
}
const venv = join(projet, '.venv-verification')
const env = (ada.apercu?.pip ?? []).length ? { ...process.env, VIRTUAL_ENV: venv, PATH: `${join(venv, 'bin')}:${process.env.PATH}` } : process.env
const executer = (titre, commande, cwd = projet) => {
  console.log(`\n▶ ${titre}`)
  execFileSync('bash', ['-euo', 'pipefail', '-c', commande], { cwd, stdio: 'inherit', env })
}
try {
  if ((ada.apercu?.pip ?? []).length) executer('environnement Python', `python3 -m venv ${JSON.stringify(venv)}`)
  for (const sousDossier of ada.apercu?.pip ?? []) {
    const fichier = existsSync(join(projet, sousDossier, 'requirements-dev.txt')) ? 'requirements-dev.txt' : 'requirements.txt'
    executer(`installation Python (${sousDossier})`, `pip install --quiet --disable-pip-version-check -r ${fichier}`, join(projet, sousDossier))
  }
  for (const sousDossier of ada.apercu?.npm ?? []) {
    executer(`installation (${sousDossier})`, 'npm ci --no-audit --no-fund', join(projet, sousDossier))
  }
  for (const controle of ada.controles) {
    executer(controle, controle.replaceAll('/app', projet))
  }
} catch {
  console.error(`\n✘ Modèle ${modele} : un contrôle échoue (projet assemblé conservé pour enquête : ${projet})`)
  process.exit(1)
}
rmSync(projet, { recursive: true, force: true })
console.log(`\n✔ Modèle ${modele} : tous les contrôles passent`)
