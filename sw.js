// ════════════════════════════════════════════════════════════════
//  TJBNSCM Mining Operations — Service Worker
//  Strategy:
//    • App shell (index.html, manifest, icons, CDN libs): cache-first
//    • database.json: network-first (so seed updates propagate)
//    • Bump CACHE_VERSION on every release to invalidate old caches
// ════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'tjbnscm-v3-2026-06-15';
const SCOPE         = '/Dashboard-of-mining-budget-3/';

// Files that make up the app shell — fetched once and served offline
const SHELL_ASSETS = [
  SCOPE,
  SCOPE + 'index.html',
  SCOPE + 'manifest.json',
  SCOPE + 'icons/icon-48x48.png',
  SCOPE + 'icons/icon-72x72.png',
  SCOPE + 'icons/icon-96x96.png',
  SCOPE + 'icons/icon-144x144.png',
  SCOPE + 'icons/icon-180x180.png',
  SCOPE + 'icons/icon-192x192.png',
  SCOPE + 'icons/icon-512x512.png',
  // CDN libraries used by the app (cached opaquely)
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// ── INSTALL ────────────────────────────────────────────────────────
// Pre-cache the app shell. Failing assets are tolerated so install
// still completes even if a single CDN URL hiccups.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(
        SHELL_ASSETS.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch(err => console.warn('[SW] Pre-cache skipped:', url, err.message))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────────
// Delete old caches, then take control of every open client.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET; everything else bypasses the cache layer
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  // ── 1. database.json — network-first ─────────────────────────────
  //    Seed data may change between releases; prefer fresh, fall back
  //    to cache when offline.
  if(url.pathname.endsWith('/database.json')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if(res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ── 2. Navigation requests — network-first, fallback to index ─────
  //    Lets fresh HTML load when online, app shell when offline.
  if(req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match(SCOPE + 'index.html')))
    );
    return;
  }

  // ── 3. Everything else (shell + icons + CDN libs) — cache-first ───
  event.respondWith(
    caches.match(req).then(cached => {
      if(cached) return cached;
      return fetch(req).then(res => {
        // Cache successful or opaque (CDN) responses
        if(res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);  // last-resort fallback
    })
  );
});

// ── MESSAGE ────────────────────────────────────────────────────────
// Allow the page to trigger an immediate update via:
//   navigator.serviceWorker.controller.postMessage({type:'SKIP_WAITING'})
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
