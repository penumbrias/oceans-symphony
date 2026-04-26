// Oceans Symphony — Offline-First Service Worker
// Cache-First for static assets; Stale-While-Revalidate for navigation
// IndexedDB pass-through for /local-image/ avatar requests

const CACHE_NAME = 'oceans-symphony-v2';

// ── Default avatar returned when an image ID isn't found in IDB ──
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
  <rect width="40" height="40" rx="20" fill="#334155"/>
  <circle cx="20" cy="16" r="7" fill="#94a3b8"/>
  <path d="M6 36c0-7.732 6.268-14 14-14s14 6.268 14 14" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;

// ── IDB helpers (SW has its own context, no module imports) ──
function openImagesDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('symphony_images', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      if (!e.target.result.objectStoreNames.contains('images')) {
        e.target.result.createObjectStore('images');
      }
    };
  });
}

function getImageFromDb(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(['images'], 'readonly');
    const req = tx.objectStore('images').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function dataUrlToResponse(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return null;
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Response(bytes.buffer, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return null;
  }
}

function defaultAvatarResponse() {
  return new Response(DEFAULT_AVATAR_SVG, {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
  });
}

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

  // ── Local image pass-through: serve avatar blobs directly from IndexedDB ──
  if (url.pathname.startsWith('/local-image/')) {
    const imageId = decodeURIComponent(url.pathname.slice('/local-image/'.length));
    event.respondWith(
      openImagesDb()
        .then((db) => getImageFromDb(db, imageId))
        .then((imageData) => {
          if (!imageData) return defaultAvatarResponse();
          if (typeof imageData === 'string' && imageData.startsWith('data:')) {
            return dataUrlToResponse(imageData) || defaultAvatarResponse();
          }
          // Already binary (ArrayBuffer / Uint8Array)
          return new Response(imageData, {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' },
          });
        })
        .catch(() => defaultAvatarResponse())
    );
    return;
  }

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
