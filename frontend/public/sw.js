// frontend/public/sw.js
const CACHE = 'magazijn-v1';
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
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
