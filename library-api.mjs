import { readFile, writeFile, readdir, rename, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { generateArbitrationLibrary } from './documents.mjs'
import { publication, publicationActive, startLibraryPublication } from './library-publish.mjs'

const execute = promisify(execFile)
const directory = new URL('./documents/arbitrage/', import.meta.url)
const trash = new URL('./documents/archives/', import.meta.url)
const LIMIT = 16 * 1024 * 1024
let queue = Promise.resolve()
function localRequest(request) {
  const address = request.socket.remoteAddress
  const host = request.headers.host || ''
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
}
function fileUrl(name) {
  if (typeof name !== 'string' || path.basename(name) !== name || !name.endsWith('.txt')) throw new Error('Document invalide.')
  return new URL(encodeURIComponent(name), directory)
}
async function bodyOf(request) {
  const chunks = []; let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > LIMIT) throw new Error('Fichier trop volumineux (10 Mo maximum).')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export async function extractLibraryText(data) {
  if (typeof data.content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.content)) throw new Error('Contenu de fichier invalide.')
  const bytes = Buffer.from(data.content, 'base64')
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Fichier trop volumineux (10 Mo maximum).')
  let text
  if (/\.pdf$/i.test(data.filename || '')) {
    const temporary = await mkdtemp(path.join(tmpdir(), 'rotations-library-'))
    try {
      const input = path.join(temporary, 'document.pdf'), output = path.join(temporary, 'document.txt')
      await writeFile(input, bytes)
      try { await execute('pdftotext', ['-layout', '-enc', 'UTF-8', input, output], { timeout: 30000 }) }
      catch (error) { throw new Error(error.code === 'ENOENT' ? 'L’outil de lecture PDF doit être installé sur cet ordinateur (Poppler).' : 'Impossible de lire ce PDF. Vérifiez qu’il est valide et non protégé.') }
      text = await readFile(output, 'utf8')
    } finally { await rm(temporary, { recursive: true, force: true }) }
  } else if (/\.txt$/i.test(data.filename || '')) text = bytes.toString('utf8').replace(/^\uFEFF/, '')
  else throw new Error('Choisissez un fichier PDF ou TXT.')
  if (!text.trim()) throw new Error('Ce document ne contient pas de texte lisible. Pour un PDF scanné, fournissez une version avec reconnaissance de texte.')
  return text
}
async function archiveDocument(name) {
  await mkdir(trash, { recursive: true })
  const archived = new URL(encodeURIComponent(`${Date.now()}-${name}`), trash)
  await rename(fileUrl(name), archived)
  return archived
}
async function handle(request, response) {
  const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)) }
  if (!localRequest(request)) { send(403, { error: 'Gestion disponible uniquement sur cet ordinateur.' }); return }
  try {
    const publicationRequest = new URL(request.url, 'http://localhost').pathname === '/api/library/publication'
    if (request.method === 'GET' && publicationRequest) { send(200, publication); return }
    if (request.method !== 'GET') {
      if (request.headers.origin !== `http://${request.headers.host}` || !request.headers['content-type']?.startsWith('application/json')) { send(403, { error: 'Requête non autorisée.' }); return }
      if (request.method !== 'POST') { send(405, { error: 'Méthode non autorisée.' }); return }
      const data = await bodyOf(request)
      if (publicationRequest) {
        if (data.action !== 'publish') throw new Error('Action inconnue.')
        send(202, startLibraryPublication()); return
      }
      if (publicationActive()) throw new Error('Attendez la fin de la publication pour modifier les documents.')
      if (data.action === 'remove') {
        await archiveDocument(data.target)
      } else if (data.action === 'save') {
        const text = await extractLibraryText(data)
        const title = String(data.title || '').normalize('NFC').trim()
        if (!title || title.length > 120 || /[\/\\\x00-\x1f]/.test(title) || title.startsWith('.')) throw new Error('Choisissez un titre valide (120 caractères maximum).')
        const name = `${title}.txt`, target = fileUrl(name)
        const names = await readdir(directory)
        if (names.includes(name) && name !== data.target) throw new Error('Ce titre existe déjà. Utilisez le bouton Remplacer du document.')
        let archived = null
        if (data.target) {
          await readFile(fileUrl(data.target)) // Validate the existing document before changing anything.
          archived = await archiveDocument(data.target)
        }
        try { await writeFile(target, text, { flag: 'wx' }) }
        catch (error) {
          if (archived) await rename(archived, fileUrl(data.target))
          throw new Error(`Impossible d’enregistrer le document : ${error.message}`) }
      } else throw new Error('Action inconnue.')
    }
    const documents = await generateArbitrationLibrary()
    send(200, { documents: documents.map(doc => ({ title: doc.title, filename: `${doc.title}.txt`, pages: doc.pages.length })), library: documents })
  } catch (error) { send(400, { error: error.message }) }
}
export function handleLibraryRequest(request, response) {
  const operation = queue.then(() => handle(request, response))
  queue = operation.catch(() => {})
  return operation
}
