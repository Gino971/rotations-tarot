import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const files = ['index.html', 'style.css', 'app.js', 'engine.js', 'timer.js', 'optimizer.js', 'movements.js', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'sw.js']
const root = new URL('./', import.meta.url)
const output = new URL('./dist/', root)
await mkdir(output, { recursive: true })
const assets = await Promise.all(files.map(async name => [name, await readFile(new URL(name, root))]))
const hash = createHash('sha256')
for (const [name, bytes] of assets) { hash.update(name); hash.update(bytes) }
const version = hash.digest('hex').slice(0, 16)
for (const [name, bytes] of assets) {
  const content = name === 'sw.js' ? bytes.toString().replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`) : bytes
  await writeFile(new URL(name, output), content)
}
await writeFile(new URL('.nojekyll', output), '')
console.log(`Application prête : dist/ (version ${version})`)
