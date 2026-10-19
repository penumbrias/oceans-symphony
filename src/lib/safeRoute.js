// Guards for links that come from user content (bios, bulletins, journals,
// imported files). Two jobs:
//
// 1. safeInternalRoute(path) — only a plain in-app path ("/alter/123",
//    "/journals?x=1") may be handed to react-router. Backslashes, "//",
//    control characters and anything that resolves to another origin are
//    rejected: browsers read "/\evil.com" as "//evil.com", which is the
//    React Router open-redirect trick (GHSA-wrjc-x8rr-h8h6).
//
// 2. isCapacitorInternalPath(pathname) — the native apps serve internal
//    helpers under "/_capacitor_…" on the app's own origin. Opening one of
//    those as a page can load outside content with the app's access
//    (GHSA-rvm3-566m-v7fv). The fixed Capacitor version closes that; this
//    is a second lock so user content can never navigate there at all.

const CAPACITOR_PREFIX = "/_capacitor_";

export function isCapacitorInternalPath(pathname) {
  if (typeof pathname !== "string") return false;
  let p = pathname;
  try { p = decodeURIComponent(pathname); } catch { /* keep raw */ }
  return p.toLowerCase().startsWith(CAPACITOR_PREFIX);
}

export function safeInternalRoute(path) {
  if (typeof path !== "string") return null;
  const route = path.trim();
  if (!route.startsWith("/") || route.startsWith("//")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(route)) return null;
  try {
    const base = typeof window !== "undefined" && window.location ? window.location.origin : "http://localhost";
    const u = new URL(route, base);
    if (u.origin !== new URL(base).origin) return null;
    if (isCapacitorInternalPath(u.pathname)) return null;
  } catch {
    return null;
  }
  return route;
}
