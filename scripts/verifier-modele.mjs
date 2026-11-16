#!/usr/bin/env node
// Vérifie un modèle du catalogue comme le ferait son propre projet : installation des dépendances
// (npm ci) dans chaque dossier déclaré par ada.json, puis chacun de ses contrôles (lint, types,
// tests dont accessibilité, compilation). Les chemins /app du conteneur deviennent le dossier du modèle.
// Usage : node scripts/verifier-modele.mjs <modèle>      (ex. : vue-nest-dsfr, maquette)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const modele = process.argv[2]
const dossier = resolve('catalogue', modele ?? '')
if (!modele || !existsSync(join(dossier, 'ada.json'))) {
  console.error(`Modèle introuvable : catalogue/${modele ?? '?'}/ada.json`)
  process.exit(1)
}
const ada = JSON.parse(readFileSync(join(dossier, 'ada.json'), 'utf8'))
const executer = (titre, commande, cwd = dossier) => {
  console.log(`\n▶ ${titre}`)
  execFileSync('bash', ['-euo', 'pipefail', '-c', commande], { cwd, stdio: 'inherit' })
}
for (const sousDossier of ada.apercu?.npm ?? []) {
  executer(`installation (${sousDossier})`, 'npm ci --no-audit --no-fund', join(dossier, sousDossier))
}
for (const controle of ada.controles) {
  executer(controle, controle.replaceAll('/app', dossier))
}
console.log(`\n✔ Modèle ${modele} : tous les contrôles passent`)
