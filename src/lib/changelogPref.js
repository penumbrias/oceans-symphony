// Tiny localStorage-backed preference controlling whether the in-app
// changelog surfaces (Settings → Recent Updates) are shown.
//
// The dashboard "What's new" bar (NewFeaturesBar) is governed separately
// by the dashboard layout toggle `new_features_bar` — see
// src/lib/dashboardLayout.js. This preference only gates the always-on
// Settings → "What's new" / Recent Updates section so users who don't
// want a changelog at all can hide it.
//
// Default is ON (true) so nothing changes for existing users unless they
// explicitly opt out. A missing / unparseable value reads as ON.
const STORAGE_KEY = "symphony_show_changelog_v1";

export function getShowChangelog() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    // null (never set) → default ON. Only the explicit string "false"
    // turns it off.
    return v !== "false";
  } catch {
    return true;
  }
}

export function setShowChangelog(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    // Let any mounted listener (the Settings toggle + RecentUpdates) react
    // without a full reload.
    window.dispatchEvent(new CustomEvent("changelog-pref-changed", { detail: { enabled: !!enabled } }));
  } catch {
    /* localStorage off (private mode / quota) — silently ignore */
  }
}
