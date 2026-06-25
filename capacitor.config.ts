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
    // Status-bar icon for every LOCAL notification (scheduled reminders,
    // plan reminders, the ongoing/persistent status notifications). Points
    // at the full-colour app art (res/drawable/ic_notif_large.png, copied
    // from the launcher icon) so Samsung/One UI — which renders notification
    // icons in colour — shows the actual drawing in the status bar, matching
    // how FCM reminders already appear. Stock Android (Pixel) force-tints
    // small icons to a flat shape; the large icon (set per-notification)
    // still shows the colour art in the shade there. A monochrome fallback
    // glyph lives at res/drawable/ic_stat_symphony.xml if we ever want the
    // universally-clean look instead. Cloud (FCM) pushes use the matching
    // default_notification_icon meta-data in AndroidManifest.xml.
    LocalNotifications: {
      smallIcon: 'ic_notif_large',
      iconColor: '#2563EB',
    },
    // overlaysWebView: true lets the WebView render edge-to-edge,
    // including up into the status bar area and down behind the
    // navigation-gesture pill. The app chrome (sticky header, bottom
    // nav, banners) already has env(safe-area-inset-*) paddings that
    // push CONTENT clear of system UI while letting BACKGROUND fill
    // the entire screen — that combination produces the modern
    // edge-to-edge mobile look.
    StatusBar: {
      overlaysWebView: true,
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
