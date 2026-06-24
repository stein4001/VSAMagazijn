// frontend/public/sw.js
const CACHE = 'magazijn-v4';
const ASSETS = ['/', '/index.html', '/css/app.css', '/js/app.js', '/js/api.js', '/js/scanner.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // Check vóór claim of er al open vensters zijn (= dit is een update, geen eerste installatie)
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(bestaand => {
        const isUpdate = bestaand.length > 0;
        return caches.keys()
          .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
          .then(() => self.clients.claim())
          .then(() => isUpdate ? self.clients.matchAll({ type: 'window' }) : [])
          .then(vensters => vensters.forEach(v => v.navigate(v.url)));
      })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;

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
