const VERSION = 'v11'
const PREFIX = `rotations-tarot:${self.registration.scope}:`
const CACHE = PREFIX + VERSION
const FILES = ['./', './index.html', './style.css', './app.js', './engine.js', './movements.js', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './manifest.webmanifest']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  // Refresh cached files whenever the device is online, then fall back to the
  // installed copy immediately when it is offline.
  event.respondWith(caches.open(CACHE).then(async cache => {
    try {
      const response = await fetch(event.request)
      if (response.ok) await cache.put(event.request, response.clone())
      return response
    } catch {
      const cached = await cache.match(event.request)
      if (cached) return cached
      if (event.request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error()
      return Response.error()
    }
  }))
})
