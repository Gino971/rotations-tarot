import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('./sw.js', import.meta.url), 'utf8')

function worker({ online = false } = {}) {
  const scope = 'https://example.test/rotations-tarot/'
  const events = new Map()
  const stores = new Map()
  let networkCalls = 0
  let claimed = false
  let skipped = false
  const key = request => typeof request === 'string' ? new URL(request, scope).href : request.url
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map())
      const entries = stores.get(name)
      return {
        async addAll(files) { for (const file of files) entries.set(key(file), `cached:${file}`) },
        async match(request) { const body = entries.get(key(request)); return body === undefined ? undefined : new Response(body) },
        async put(request, response) { entries.set(key(request), await response.text()) }
      }
    },
    async keys() { return [...stores.keys()] },
    async delete(name) { return stores.delete(name) }
  }
  vm.runInNewContext(source, {
    self: {
      registration: { scope }, location: { origin: new URL(scope).origin },
      addEventListener(name, handler) { events.set(name, handler) },
      async skipWaiting() { skipped = true }, clients: { async claim() { claimed = true } }
    },
    caches, URL, Response,
    async fetch(request) {
      networkCalls++
      if (!online) throw new Error('Network offline')
      return new Response(`network:${key(request)}`)
    }
  })
  return {
    stores, scope,
    get networkCalls() { return networkCalls },
    get claimed() { return claimed },
    get skipped() { return skipped },
    async lifecycle(name) { let result; events.get(name)({ waitUntil(promise) { result = promise } }); await result },
    async request(file, mode = 'cors', method = 'GET') {
      let result
      events.get('fetch')({ request: { url: new URL(file, scope).href, method, mode }, respondWith(promise) { result = promise } })
      return result
    }
  }
}

test('installation caches every app dependency, including iPhone icons', async () => {
  const app = worker()
  await app.lifecycle('install')
  assert.ok(app.skipped)
  const entries = [...app.stores.values()][0]
  for (const filename of ['index.html', 'app.js', 'engine.js', 'optimizer.js', 'movements.js', 'style.css', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png']) {
    assert.ok(entries.has(new URL(filename, app.scope).href))
    await readFile(new URL(filename, import.meta.url))
  }
})

test('installed app and modules reopen from cache when the network is unavailable', async () => {
  const app = worker()
  await app.lifecycle('install')
  for (const filename of ['./', 'index.html', 'app.js', 'engine.js', 'optimizer.js', 'movements.js', 'style.css']) {
    const response = await app.request(filename)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), `cached:${filename === './' ? './' : './' + filename}`)
  }
  assert.equal(app.networkCalls, 7)
})

test('navigation with a query uses the cached app under its repository path', async () => {
  const app = worker()
  await app.lifecycle('install')
  const response = await app.request('./?installed=1', 'navigate')
  assert.equal(await response.text(), 'cached:./index.html')
  assert.equal(app.networkCalls, 1)
})

test('online requests refresh old cached application files', async () => {
  const app = worker({ online: true })
  await app.lifecycle('install')
  const response = await app.request('engine.js')
  const url = new URL('engine.js', app.scope).href
  assert.equal(await response.text(), `network:${url}`)
  const entries = [...app.stores.values()][0]
  assert.equal(entries.get(url), `network:${url}`)
})

test('activation preserves the caches of other apps and scopes', async () => {
  const app = worker()
  app.stores.set(`rotations-tarot:${app.scope}:old`, new Map())
  app.stores.set('rotations-tarot:https://example.test/another-app/:v1', new Map())
  app.stores.set('other-app', new Map())
  await app.lifecycle('install')
  await app.lifecycle('activate')
  assert.ok(app.claimed)
  assert.ok(!app.stores.has(`rotations-tarot:${app.scope}:old`))
  assert.ok(app.stores.has('other-app'))
  assert.ok(app.stores.has('rotations-tarot:https://example.test/another-app/:v1'))
})

test('unknown offline resources fail safely, unrelated requests are untouched', async () => {
  const app = worker()
  await app.lifecycle('install')
  assert.equal((await app.request('unknown.png')).type, 'error')
  assert.equal(await app.request('https://another.test/icon.png'), undefined)
  assert.equal(await app.request('index.html', 'cors', 'POST'), undefined)
})
