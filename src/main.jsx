import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Register offline-caching service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Clear the app icon badge on every app open and every time the tab/app gains focus.
// This handles the badge that iOS/Android sets when a push notification is delivered.
function clearAppBadge() {
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }
}
clearAppBadge();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') clearAppBadge();
});
