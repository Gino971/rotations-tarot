import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))
const port = Number(process.env.PORT || 4173)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const filename = path.resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '')
    if (!filename.startsWith(root) || !types[path.extname(filename)]) { response.writeHead(404); response.end('Introuvable'); return }
    const content = await readFile(filename)
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)], 'Cache-Control': 'no-cache' })
    response.end(content)
  } catch { response.writeHead(404); response.end('Introuvable') }
}).listen(port, '0.0.0.0', () => console.log(`Rotations Tarot : http://localhost:${port}`))
