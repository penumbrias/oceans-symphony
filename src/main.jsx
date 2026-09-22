import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { isDesktop } from '@/lib/platform'

// Route-level code splitting (v0.184.0) means a page's JS is fetched on
// first navigation. If the app was open across a deploy, that fetch can
// 404 (Vercel removed the old hashed chunk) — Vite reports it as
// `vite:preloadError`. Reload ONCE to pick up the new build instead of
// showing "Something went wrong". The sessionStorage guard stops a loop if
// the reload itself can't get the chunk (e.g. genuinely offline).
window.addEventListener('vite:preloadError', (event) => {
  try {
    const KEY = 'symphony_chunk_reload_once';
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return; // already tried very recently — let the error surface
    sessionStorage.setItem(KEY, String(Date.now()));
    event.preventDefault?.();
    window.location.reload();
  } catch { /* fall through to the error boundary */ }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Register offline-caching service worker.
//
// Skipped on the Electron desktop build (v0.240.0). The desktop shell
// serves the app from symphony://app, and the Cache API only accepts
// http/https requests — so sw.js's install step throws
// "Request scheme 'symphony' is unsupported" and the SW never activates.
// Nothing is lost by not having it there: its two jobs are offline asset
// caching (the assets are already on local disk, inside the app bundle)
// and intercepting /local-image/ avatar requests, which
// imageUrlResolver.js already resolves straight from IndexedDB whenever
// no SW controls the page — the same fallback the iOS build relies on.
if ('serviceWorker' in navigator && !isDesktop()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
