// ValidX Service Worker
// Strategy:
//   - HTML pages: network-first with cache fallback (so updates roll out fast)
//   - Static assets (icons, manifest, css, js): cache-first
//   - CDN libraries (react, babel): cache-first with background update
//   - Offline fallback: offline.html

const VERSION = 'v3';
const CACHE_STATIC = `validx-static-${VERSION}`;
const CACHE_PAGES  = `validx-pages-${VERSION}`;
const CACHE_CDN    = `validx-cdn-${VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './app.html',
  './offline.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

// ── Install ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => ![CACHE_STATIC, CACHE_PAGES, CACHE_CDN].includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ───────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin CDN assets (React, Babel, etc.)
  if (url.origin !== location.origin) {
    event.respondWith(cacheFirst(request, CACHE_CDN));
    return;
  }

  // HTML documents: network-first, fall back to cache, then offline page
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  // Everything else same-origin: cache-first
  event.respondWith(cacheFirst(request, CACHE_STATIC));
});

// ── Strategies ──────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in background
    fetch(request).then(res => {
      if (res && res.ok) cache.put(request, res.clone());
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE_PAGES);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const coreCache = await caches.open(CACHE_STATIC);
    const fallback = await coreCache.match('./offline.html');
    return fallback || new Response('Offline', { status: 503 });
  }
}

// ── Skip waiting on message from page ───────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
