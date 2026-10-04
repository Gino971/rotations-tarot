const VERSION = 'v67'
const PREFIX = `rotations-tarot:${self.registration.scope}:`
const CACHE = PREFIX + VERSION
const FILES = ['./', './index.html', './style.css', './app.js', './engine.js', './app.js?v=67', './engine.js?v=67', './optimizer.js', './movements.js', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './manifest.webmanifest']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' })))).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  // Each installed version is complete: start from its local files without
  // waiting for the network, and update the whole app via the worker lifecycle.
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request)
    if (cached) return cached
    if (event.request.mode === 'navigate') {
      const shell = await cache.match('./index.html')
      if (shell) return shell
    }
    try {
      return await fetch(event.request)
    } catch {
      return Response.error()
    }
  }))
})
