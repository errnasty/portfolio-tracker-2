/* Aureus service worker — deliberately minimal for a finance app.
 * Strategy: network-first for everything, with a cache of successfully
 * fetched static assets + visited pages used ONLY as an offline fallback.
 * Financial data must never be served stale while online. */

const CACHE = 'aureus-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Never touch API/data or cross-origin requests.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request)
      // Cache static assets and page navigations for the offline fallback.
      if (fresh.ok && (request.destination !== '' || request.mode === 'navigate')) {
        const cache = await caches.open(CACHE)
        cache.put(request, fresh.clone())
      }
      return fresh
    } catch {
      const cached = await caches.match(request)
      if (cached) return cached
      if (request.mode === 'navigate') {
        const fallback = await caches.match('/dashboard')
        if (fallback) return fallback
      }
      throw new Error('offline and not cached')
    }
  })())
})
