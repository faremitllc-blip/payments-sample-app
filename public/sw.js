// Mondo service worker. It only makes the app installable and shows a friendly page when the
// phone is offline. It never stores account data, API answers or pages: a money app must
// always show what the server says right now.
const OFFLINE = '/offline.html'
const CACHE = 'mondo-offline-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Only page loads. Everything else (API, login, assets) goes straight to the network.
  if (req.mode !== 'navigate') return
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
})
