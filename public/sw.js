/* Service worker Abdou Baba — PWA (AM-10).
   Volontairement MINIMAL et SÛR : ne met JAMAIS en cache de contenu dynamique,
   authentifié ou de données Next.js (RSC) -> zéro risque de page/donnée périmée.
   Rôle unique : rendre l'app installable + fournir un repli hors-ligne propre. */
const CACHE = 'abdoubaba-shell-v1'
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  // Navigations : réseau d'abord. Hors-ligne -> page de repli (jamais de HTML périmé/authentifié).
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  // Icônes précachées (statiques, sûrs) : cache d'abord.
  const path = new URL(request.url).pathname
  if (PRECACHE.includes(path)) {
    event.respondWith(caches.match(request).then((r) => r || fetch(request)))
    return
  }

  // Tout le reste : passe-plat réseau, aucun cache -> aucune donnée périmée.
})
