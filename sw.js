const CACHE = 'reading-doc-v3';
const ASSETS = ['./index.html', './manifest.json', './icons/icon-128.png', './icons/icon-192.png'];
// HTML/JS shell changes often during development — always prefer the network
// for it so edits show up on next reload, and only fall back to the cached
// copy when offline. Static assets (icons, manifest) rarely change, so those
// stay cache-first for speed.
const NETWORK_FIRST = ['index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const isNetworkFirst = e.request.mode === 'navigate'
    || NETWORK_FIRST.some(name => e.request.url.endsWith(name));

  if (isNetworkFirst) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => cached))
  );
});
