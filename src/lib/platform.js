// Runtime detection of which build target the app is currently running in.
//
// Three targets share the same React codebase:
//   1. Web PWA (Vercel)             → isNative() === false
//   2. Bubblewrap TWA (Chrome CCT)  → isNative() === false
//   3. Capacitor Android (native)   → isNative() === true
//
// The branch predicate is `window.Capacitor?.isNativePlatform()` — set by
// Capacitor's `capacitor.js` bridge script, which is only present when the
// HTML is loaded from the APK's bundled assets. We DO NOT sniff the
// user agent: the WebView UA can be ambiguous and unstable across
// Android updates.
//
// Calls are safe before Capacitor's bridge initialises (returns false in
// that small window, which is the correct behaviour — web-side defaults).

export function isNative() {
  try {
    return !!(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform && globalThis.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

export function getNativePlatform() {
  try {
    return globalThis.Capacitor?.getPlatform?.() || 'web';
  } catch {
    return 'web';
  }
}
