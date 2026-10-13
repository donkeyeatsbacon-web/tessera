// Tessera service worker: makes the app work offline and installable.
// App files are served from cache and refreshed in the background
// (stale-while-revalidate), so a deploy shows up on the next visit.
// Bump CACHE when the list of core files changes.
const CACHE = 'tessera-v1';
const CORE = [
  './',
  'index.html',
  'tessera.css',
  'js/analysis.js',
  'js/samples.js',
  'js/export-image.js',
  'js/app.js',
  'favicon.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Same-origin GETs only; PoetryDB and Google Fonts go straight to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: url.pathname.endsWith('/') }).then((cached) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok && res.type === 'basic') cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        if (cached) {
          event.waitUntil(fresh);
          return cached;
        }
        return fresh;
      })
    )
  );
});
