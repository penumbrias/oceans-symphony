import type { CapacitorConfig } from '@capacitor/cli';

// Oceans Symphony — Capacitor native build target.
//
// This config is ONLY consumed when building the native Android (or later
// iOS) app via `npx cap`. The web PWA build (Vercel) and the existing
// Bubblewrap TWA build do not read this file and are unaffected by it.
//
// Design notes (see /root/.claude/plans/is-there-any-way-glowing-wand.md):
//
// - `appId` is intentionally NOT one of the TWA ids in
//   `public/assetlinks.json` — the native app ships under a distinct
//   Play Store listing so users can install it alongside the existing
//   TWA, test, and choose. The TWA's update channel is never disturbed.
//   `nativeapp` (rather than `native`) avoids colliding with Java's
//   reserved `native` keyword in the generated package path.
//
// - `server.androidScheme: 'https'` keeps the WebView's
//   `window.location.protocol` as `https:` so Service Worker
//   registration, secure cookies, and HTTPS-only feature checks behave
//   identically to the web build.
//
// - `server.hostname` is a stable PRIVATE hostname, NOT the real
//   `oceans-symphony.vercel.app`. Using a different hostname:
//     (a) makes "I am running inside the native app" detectable from
//         JS without sniffing user agents;
//     (b) prevents any cookie or Service Worker scope collision with
//         the real domain;
//     (c) keeps Android App Links deep-linking predictable — only
//         opt-in URLs hit the app.
//
// - Web assets are bundled into the APK. No `server.url` — pointing the
//   WebView at the live Vercel URL would kill offline behaviour and
//   skip Capacitor's native-bridge JS injection.
const config: CapacitorConfig = {
  appId: 'app.oceans_symphony.nativeapp',
  appName: 'Oceans Symphony',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'app.local.oceans-symphony',
  },
};

export default config;
