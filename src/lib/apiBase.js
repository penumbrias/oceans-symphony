// Single source of truth for where the app's server endpoints live.
//
// There are three server surfaces, all optional and all opt-in: the
// Friends relay (/api/friends), the reminder relay (/api/reminders) and
// web-push send (/api/push). The app is local-first and talks to none of
// them unless the user turns those features on.
//
// ── Why this file exists ──
//
// The rule used to be duplicated in friendsApi.js and serverReminderSync.js
// as `isNative() ? "https://oceans-symphony.app/api/x" : "/api/x"`, and
// pushRegistration.js just hardcoded the relative path. A relative path
// only works when the page was served from the deploy that hosts the API:
//
//   web PWA / TWA        → served from oceans-symphony.app   → relative OK
//   Capacitor native     → served from app.local.oceans-…    → needs absolute
//   Electron desktop     → served from symphony://app        → needs absolute
//
// The desktop shell added a third origin that isn't the web origin, which
// is what forced the consolidation. Relative paths under symphony://app
// resolve to the protocol handler, which correctly 404s them — and a 404
// HTML body hitting a JSON parser is the "Unexpected token '<'" failure
// the native build already learned about the hard way.
//
// ── Self-hosting (forward-looking) ──
//
// getApiHost() honours a user override, so pointing the app at a
// self-hosted relay is a host string rather than a code change. The
// server side (running api/friends/* off Vercel, and the fact that friend
// codes are scoped to whichever relay minted them) is a separate piece of
// work — this file only makes sure nothing in the client hardcodes the
// host any more.
//
// NOTE: the *_API_BASE consts built from this are evaluated at module
// load, so changing the host takes effect on the next app start. That is
// deliberate — a relay switch changes identity scope, so a reload is the
// honest boundary rather than something to paper over mid-session.
//
// NOTE: the CSP (see vite.config.js) allows `connect-src 'self' https:`.
// A self-hosted relay must therefore be HTTPS; a plain-http LAN address
// would be blocked by the policy, not by this file.

import { isAppShell } from "@/lib/platform";

// The canonical production deploy. Must stay oceans-symphony.app (NOT the
// .vercel.app staging URL) — origin decides storage scope and CORS, and
// the TWA wrapped this origin.
export const DEFAULT_API_HOST = "https://oceans-symphony.app";

// User-set relay host. Registered in BACKUP_LS_KEYS so it rides along with
// the settings mirror + backups like every other user preference.
export const API_HOST_KEY = "symphony_api_host";

const stripTrailingSlashes = (s) => String(s || "").replace(/\/+$/, "");

// The host override, or "" when the user hasn't set one.
export function getApiHostOverride() {
  try {
    return stripTrailingSlashes(localStorage.getItem(API_HOST_KEY) || "");
  } catch {
    return "";
  }
}

export function getApiHost() {
  return getApiHostOverride() || DEFAULT_API_HOST;
}

// Persist (or clear, with a falsy value) the relay host. Takes effect on
// the next app start — see the note above.
export function setApiHost(host) {
  try {
    const clean = stripTrailingSlashes(host);
    if (clean) localStorage.setItem(API_HOST_KEY, clean);
    else localStorage.removeItem(API_HOST_KEY);
    return true;
  } catch {
    return false;
  }
}

// Base URL for one API surface. `segment` is the path under /api, e.g.
// "friends". Returns a relative path in the browser (same-origin, no CORS
// preflight, works on preview deploys) and an absolute URL wherever the
// page isn't served by the API host — the packaged app targets, or any
// time the user has pointed at their own relay.
export function apiBase(segment) {
  const seg = String(segment || "").replace(/^\/+|\/+$/g, "");
  const override = getApiHostOverride();
  if (override) return `${override}/api/${seg}`;
  if (isAppShell()) return `${DEFAULT_API_HOST}/api/${seg}`;
  return `/api/${seg}`;
}
