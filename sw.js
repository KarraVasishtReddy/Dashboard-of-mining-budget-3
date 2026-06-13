// TJBNSCM Mining Operations — Service Worker v2
// Required for Windows Store app launch, offline support, and PWABuilder score

const CACHE_NAME = 'tjbnscm-v2';
const APP_URL = 'https://karravasishtreddy.github.io/Dashboard-of-mining-budget-2/';

// Core files to cache on install — app must launch offline from Windows Store
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

// CDN assets cached on first use (Chart.js, SheetJS, Google Fonts)
const CDN_CACHE = 'tjbnscm-cdn-v2';

// ── INSTALL: cache core assets immediately ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache each file individually so one failure doesn't block others
        return Promise.allSettled(
          CORE_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Failed to cache:', url, err)
            )
          )
        );
      })
      .then(() => {
        console.log('[SW] Core assets cached, forcing activation');
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE: clean old caches, claim clients ───────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== CDN_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => {
        console.log('[SW] Activated, claiming clients');
        return self.clients.claim();
      })
  );
});

// ── FETCH: serve from cache first, fall back to network ─────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Strategy 1: App pages → Cache First, network fallback
  if (url.origin === self.location.origin ||
      url.hostname === 'karravasishtreddy.github.io') {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) {
            // Serve cached, update in background
            const networkUpdate = fetch(event.request)
              .then(response => {
                if (response && response.status === 200) {
                  caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, response.clone()));
                }
                return response;
              })
              .catch(() => {});
            return cached;
          }
          // Not in cache — fetch and store
          return fetch(event.request)
            .then(response => {
              if (!response || response.status !== 200) return response;
              const clone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clone));
              return response;
            })
            .catch(() => {
              // Offline fallback — return index.html for navigation requests
              if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
              }
            });
        })
    );
    return;
  }

  // Strategy 2: CDN assets (Chart.js, SheetJS, Fonts) → Cache First
  const isCDN = url.hostname.includes('cdnjs.cloudflare.com') ||
                url.hostname.includes('fonts.googleapis.com') ||
                url.hostname.includes('fonts.gstatic.com');

  if (isCDN) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request)
            .then(response => {
              if (!response || response.status !== 200) return response;
              const clone = response.clone();
              caches.open(CDN_CACHE)
                .then(cache => cache.put(event.request, clone));
              return response;
            })
            .catch(() => {
              console.warn('[SW] CDN fetch failed (offline):', url.href);
            });
        })
    );
    return;
  }
});

// ── OFFLINE FALLBACK PAGE ────────────────────────────────────
// If everything fails and we need a page, return cached index.html
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('./index.html'))
    );
  }
});

// ── MESSAGE: handle cache updates from app ──────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CACHE_NOW') {
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => console.log('[SW] Manual cache triggered'));
  }
});

// ── PUSH NOTIFICATIONS (future use) ─────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {
    title: 'TJBNSCM Mining',
    body: 'Daily MIS report reminder',
    icon: './icons/icon-192x192.png'
  };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icons/icon-192x192.png',
      badge: './icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      tag: 'tjbnscm-notification',
      renotify: true,
    })
  );
});

// ── NOTIFICATION CLICK ───────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('Dashboard-of-mining-budget-2') && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(APP_URL);
      })
  );
});

console.log('[SW] TJBNSCM Service Worker v2 loaded');
