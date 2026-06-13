// Optional, opt-in content packs — mirrors the "extra fonts" pattern in
// fontPacks.js (localStorage flag + install/uninstall + a window event so
// mounted surfaces can re-read live).
//
// Both the Changelog ("What's new" / Recent Updates) and the App Roadmap
// are OPTIONAL and DEFAULT OFF, so they stay out of the base experience
// and don't bloat the device for users who don't want them. Unlike the
// font pack there's no remote fetch — the data is plain local JS — so
// "install" just flips the flag (and optionally warms the code chunk so
// the first open is instant); "uninstall" clears it. A missing /
// unparseable flag reads as NOT installed (off by default).
//
// Surfaces that gate on these flags (NewFeaturesBar, RecentUpdates, the
// rendered Roadmap nav entries) subscribe to OPTIONAL_CONTENT_EVENT so
// they appear / disappear without a reload.

export const CHANGELOG_LS_KEY = "symphony_changelog_installed_v1";
export const ROADMAP_LS_KEY = "symphony_roadmap_installed_v1";

// Single event both features dispatch on change. Listeners re-read the
// relevant isXInstalled() to refresh.
export const OPTIONAL_CONTENT_EVENT = "optional-content-changed";

function readFlag(key) {
  try { return localStorage.getItem(key) === "true"; } catch { return false; }
}

function writeFlag(key, on) {
  try {
    if (on) localStorage.setItem(key, "true");
    else localStorage.removeItem(key);
  } catch { /* storage off (private mode / quota) — silently ignore */ }
  notifyChange();
}

function notifyChange() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OPTIONAL_CONTENT_EVENT));
  } catch { /* CustomEvent unsupported — ignore */ }
}

// ── Changelog ───────────────────────────────────────────────────────────

export function isChangelogInstalled() {
  return readFlag(CHANGELOG_LS_KEY);
}

// Persist the flag, then warm the changelog chunk so the first open is
// instant. Resolves once the flag is set — chunk warming is best-effort
// and never blocks/rejects.
export async function installChangelog() {
  writeFlag(CHANGELOG_LS_KEY, true);
  try { await import("@/lib/changelog"); } catch { /* warm-only — ignore */ }
}

export function uninstallChangelog() {
  writeFlag(CHANGELOG_LS_KEY, false);
}

// ── Roadmap ─────────────────────────────────────────────────────────────

export function isRoadmapInstalled() {
  return readFlag(ROADMAP_LS_KEY);
}

export async function installRoadmap() {
  writeFlag(ROADMAP_LS_KEY, true);
  try { await import("@/lib/roadmap"); } catch { /* warm-only — ignore */ }
}

export function uninstallRoadmap() {
  writeFlag(ROADMAP_LS_KEY, false);
}
