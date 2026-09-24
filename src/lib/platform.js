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

// ── Desktop (Electron) ──────────────────────────────────────────────────
//
// FOURTH build target (v0.240.0). The Electron preload exposes a frozen
// `window.symphonyDesktop`; its presence IS the branch predicate, same
// shape of check as isNative()'s Capacitor bridge probe. We do not sniff
// the user agent (Electron's UA contains "Chrome", so UA sniffing would
// mis-detect it as the web build).
//
// IMPORTANT: isDesktop() and isNative() are mutually exclusive — Capacitor
// is not present in the Electron shell, so isNative() stays false there
// and every existing native-only code path is skipped untouched. Anything
// that must run on BOTH app targets (as opposed to "in a browser") should
// check `isAppShell()`.

export function isDesktop() {
  try {
    return !!globalThis.symphonyDesktop?.isDesktop;
  } catch {
    return false;
  }
}

// True in either packaged app (Capacitor native or Electron desktop),
// false in a browser tab / PWA / TWA. Use this for "we are not served
// from our own web origin, so relative /api/* paths will 404" decisions.
export function isAppShell() {
  return isNative() || isDesktop();
}

// 'native' | 'desktop' | 'web' — for logging, reports and About screens.
export function getBuildTarget() {
  if (isNative()) return 'native';
  if (isDesktop()) return 'desktop';
  return 'web';
}

// The preload payload (versions + the userData path), or null off-desktop.
export function getDesktopInfo() {
  try {
    return globalThis.symphonyDesktop || null;
  } catch {
    return null;
  }
}
