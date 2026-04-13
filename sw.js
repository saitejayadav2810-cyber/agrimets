/**
 * AGRIMETS Mock Tests — Service Worker
 * Caches the app shell and mock-tests.json for offline use.
 * Network-first for JSON data, cache-first for static assets.
 */

const CACHE_NAME = 'agrimets-mock-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './mock.html',
  './mock.js',
  './mock-style.css',
  './mock-tests.json',
];

// Install — pre-cache all static assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network-first for JSON (always fresh data), cache-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always fetch fresh for mock-tests.json
  if (url.pathname.endsWith('mock-tests.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      });
    })
  );
});
