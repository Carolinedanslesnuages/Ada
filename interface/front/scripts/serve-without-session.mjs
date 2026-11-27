#!/usr/bin/env node
// Serves the built front (dist/) as ADA would for a person who is not signed in: the API
// answers 401 to everything, the other addresses return index.html (single-page application). Used by the
// accessibility check of the built pages, without starting the API or GitHub.
// Usage: node scripts/serve-without-session.mjs [port]   (default: 4173)
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', 'dist')
const port = Number(process.argv[2] ?? 4173)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }

async function existingFile(filePath) {
  try {
    return (await stat(filePath)).isFile() ? filePath : null
  } catch {
    return null
  }
}

createServer(async (httpRequest, response) => {
  const address = decodeURIComponent(new URL(httpRequest.url ?? '/', 'http://localhost').pathname)
  if (address.startsWith('/api/')) {
    response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"message":"Non connecté"}')
    return
  }
  const workRequest = join(root, normalize(address))
  const filePath = (workRequest.startsWith(root) && (await existingFile(workRequest))) || join(root, 'index.html')
  response.writeHead(200, { 'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream' })
  createReadStream(filePath).pipe(response)
}).listen(port, '127.0.0.1', () => console.log(`Front sans session : http://127.0.0.1:${port}`))
