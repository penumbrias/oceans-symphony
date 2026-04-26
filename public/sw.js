// Oceans Symphony — Offline-First Service Worker
// Cache-First for static assets; Stale-While-Revalidate for navigation

const CACHE_NAME = 'oceans-symphony-v1';

// On install: cache the app shell immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/manifest.json']))
  );
});

// On activate: evict old caches and claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from our own origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Skip push-notification SW requests
  if (url.pathname === '/sw-reminders.js') return;

  // ── Cache-First: versioned Vite assets (hashed filenames never change) ──
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Cache-First: static public files (logo, favicon, manifest, fonts) ──
  if (
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.otf') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Stale-While-Revalidate: HTML navigation (app shell) ──
  if (request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match('/').then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response.ok) cache.put('/', response.clone());
            return response;
          });
          // Return cached version immediately; update cache in background
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // ── Stale-While-Revalidate: everything else (JS modules, etc.) ──
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => {
          // Return cached version if available, otherwise a graceful offline response
          return cached || new Response('Offline — resource not yet cached.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        });
        return cached || networkFetch;
      })
    )
  );
});
