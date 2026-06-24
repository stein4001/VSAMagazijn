// frontend/public/sw.js
const CACHE = 'magazijn-v3';
const ASSETS = ['/', '/index.html', '/css/app.css', '/js/app.js', '/js/api.js', '/js/scanner.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return; // API nooit cachen

  // Network-first: altijd vers van server, cache alleen als offline
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

// Luister naar 'skipWaiting' bericht van de app
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
