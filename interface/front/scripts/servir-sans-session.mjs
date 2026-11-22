#!/usr/bin/env node
// Sert le front construit (dist/) comme le ferait ADA pour une personne non connectée : l'API
// répond 401 à tout, les autres adresses renvoient index.html (application monopage). Sert au
// contrôle d'accessibilité des pages construites, sans lancer l'API ni GitHub.
// Usage : node scripts/servir-sans-session.mjs [port]   (défaut : 4173)
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const racine = resolve(import.meta.dirname, '..', 'dist')
const port = Number(process.argv[2] ?? 4173)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }

async function fichierExistant(chemin) {
  try {
    return (await stat(chemin)).isFile() ? chemin : null
  } catch {
    return null
  }
}

createServer(async (requete, reponse) => {
  const adresse = decodeURIComponent(new URL(requete.url ?? '/', 'http://localhost').pathname)
  if (adresse.startsWith('/api/')) {
    reponse.writeHead(401, { 'Content-Type': 'application/json' }).end('{"message":"Non connecté"}')
    return
  }
  const demande = join(racine, normalize(adresse))
  const chemin = (demande.startsWith(racine) && (await fichierExistant(demande))) || join(racine, 'index.html')
  reponse.writeHead(200, { 'Content-Type': TYPES[extname(chemin)] ?? 'application/octet-stream' })
  createReadStream(chemin).pipe(reponse)
}).listen(port, '127.0.0.1', () => console.log(`Front sans session : http://127.0.0.1:${port}`))
