import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

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

// Register offline-caching service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
