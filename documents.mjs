import { readdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function readArbitrationDocuments(directory = new URL('./documents/arbitrage/', import.meta.url)) {
  const entries = await readdir(directory, { withFileTypes: true })
  const names = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.txt')).map(entry => entry.name)
  names.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
  return Promise.all(names.map(async name => {
    const text = (await readFile(new URL(encodeURIComponent(name), directory), 'utf8')).replace(/^\uFEFF/, '')
    const pages = text.split('\f').map(page => page.trim())
    if (!pages.at(-1)) pages.pop()
    if (!pages.some(page => page.length)) throw new Error(`Document vide : ${name}`)
    return { title: name.replace(/\.txt$/i, ''), pages }
  }))
}

export async function generateArbitrationLibrary() {
  const documents = await readArbitrationDocuments()
  await writeFile(new URL('./arbitrage.json', import.meta.url), JSON.stringify(documents), 'utf8')
  return documents
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const documents = await generateArbitrationLibrary()
  console.log(`Bibliothèque reconstruite : ${documents.length} documents.`)
}
