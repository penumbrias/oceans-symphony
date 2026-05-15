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
//   `oceans-symphony.app` (the canonical production domain). Using a different hostname:
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
  // NB: matches the existing TWA's Play Console listing
  // (public/assetlinks.json). Shipping the native build under this id
  // means it lands as an UPDATE to the same Play listing the testers
  // already have, rather than a new co-installable app. The TWA's
  // Chrome-storage-scoped data does NOT transfer — first-launch
  // modal in src/components/onboarding/TwaToNativeMigrationModal.jsx
  // warns the user to import a backup.
  appId: 'app.oceans_symphony.twa',
  appName: 'Oceans Symphony',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'app.local.oceans-symphony',
  },
  plugins: {
    // Apply at native init time so the WebView is sized below the system
    // status bar BEFORE the first paint. The JS-side
    // StatusBar.setOverlaysWebView call in src/lib/nativeBootstrap.js
    // still runs as a belt-and-braces re-assert after boot, but
    // configuring it here means the user never sees a frame where the
    // header sits behind the clock/icons.
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
    },
    // Periodic background poll of the Friends API so friend-front
    // updates fire a local notification even when the Symphony app
    // is fully closed. Without this we'd rely on the in-app polling
    // in src/lib/useFriendsFrontNotifications.js, which only runs
    // while the app is alive. Source lives in
    // public/runners/friends-poll.js (copied verbatim into dist/ by
    // Vite, the runner runtime loads it from the bundled assets).
    //
    // 15-minute interval is Android WorkManager's floor — anything
    // smaller is silently rounded up. Some OEMs throttle more
    // aggressively under battery optimisation; nothing we can do
    // about that from JS.
    BackgroundRunner: {
      label: 'app.oceans_symphony.twa.friends',
      src: 'runners/friends-poll.js',
      event: 'checkFriends',
      repeat: true,
      interval: 15,
      autoStart: true,
    },
  },
};

export default config;
