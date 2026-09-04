/* The Journey to Me — offline cache.
   Bump CACHE when anything in ASSETS changes, or installed copies keep the
   old files for ever. */

const CACHE = 'journey-to-me-v6';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './content.js',
  './journal.js',
  './flowers.js',
  './manifest.webmanifest',
  './assets/paper.webp',
  './assets/cover.webp',
  './assets/frame.webp',
  './assets/table.webp',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-180.png',
  './assets/icon-maskable-512.png'
];
for (let n = 1; n <= 21; n++) {
  ASSETS.push('./assets/flowers/day' + String(n).padStart(2, '0') + '.webp');
}
for (let n = 1; n <= 6; n++) {
  ASSETS.push('./assets/petals/p' + n + '.webp');
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // The 3D scene is left alone entirely.  It is under active revision, and a
  // cache-first copy would keep serving the version the client already saw.
  if (url.origin === location.origin && url.pathname.includes('/3d/')) return;

  /* Pages themselves come from the network first, falling back to the cache
     only when there is no network.  Cache-first is right for the artwork,
     which never changes silently, and wrong for the HTML, which is how a fix
     reaches anyone who has already visited. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Google Fonts: serve from cache, refresh quietly in the background, and
  // never fail the page when the device is offline.
  const isFont = url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com');

  if (isFont || url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }
});
