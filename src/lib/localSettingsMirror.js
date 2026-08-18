// Durable mirror of user-set localStorage preferences.
//
// THE PROBLEM. Every appearance / accessibility / view preference (theme,
// custom colours, saved presets, alter→preset links, font, text size, grid
// settings, …) lived ONLY in localStorage. Android "clear cache", device
// cleaners and some WebView updates wipe localStorage while leaving
// IndexedDB — the real data — intact. The user's data survived; their
// whole look reset to defaults "for zero reason". Same failure class the
// storage-layer invariants in CLAUDE.md exist for.
//
// THE FIX. The exact export allow-list (BACKUP_LS_KEYS — one source of
// truth, already maintained) is mirrored into the DB blob under a reserved
// key, so it rides the SAME encryption envelope, save queue, per-system
// scoping and backups as every entity. On boot, once the DB is readable, any
// mirrored key that is MISSING from localStorage is restored, and the
// runtime stores (theme, accessibility) are told to re-read.
//
// Rules (do not weaken):
//   • Restore ONLY fills keys that are absent. localStorage always wins when
//     present — a value the user just changed must never be reverted by an
//     older mirror. (Mirror writes are debounced; the window between a
//     change and its mirror is exactly when localStorage is newer.)
//   • Restore never touches keys outside the allow-list.
//   • Mirror never throws into the caller — a failed mirror is logged, never
//     surfaced as an app error; the source of truth at runtime is unchanged.
//   • The mirror is a plain object of string values, tiny; it is written
//     through the normal saveDb path (never a separate storage channel).

import { BACKUP_LS_KEYS } from "@/lib/backupKeys";

// Reserved pseudo-entity name inside the DB blob. Double-underscore so no
// UI ever lists it as an entity; the export/import code treats it as an
// opaque table (it also travels inside full-DB backups, which is desired).
export const MIRROR_KEY = "__local_settings_mirror";

const RESTORED_EVENT = "symphony-local-settings-restored";

let _debounce = null;
let _hooked = false;

function readAll() {
  const out = {};
  for (const key of BACKUP_LS_KEYS) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) out[key] = v;
    } catch { /* localStorage disabled */ }
  }
  return out;
}

// Write the current localStorage allow-list into the DB blob. `getDb` and
// `saveDb` are injected so this module has no import cycle with localDb.
export function mirrorLocalSettingsNow(getDb, saveDb) {
  try {
    const db = getDb();
    if (!db || typeof db !== "object") return Promise.resolve();
    const snap = readAll();
    const prev = db[MIRROR_KEY];
    // Skip the (encrypting!) save when nothing changed.
    if (prev && JSON.stringify(prev.values || {}) === JSON.stringify(snap)) return Promise.resolve();
    db[MIRROR_KEY] = { values: snap, updated_at: new Date().toISOString() };
    return saveDb().catch((e) => { console.warn("[localSettingsMirror] save failed", e); });
  } catch (e) {
    console.warn("[localSettingsMirror] mirror failed", e);
    return Promise.resolve();
  }
}

export function scheduleMirror(getDb, saveDb, delayMs = 1500) {
  if (_debounce) clearTimeout(_debounce);
  _debounce = setTimeout(() => { _debounce = null; mirrorLocalSettingsNow(getDb, saveDb); }, delayMs);
}

// Restore missing keys from the DB mirror. Returns the list of keys filled.
// Called by initLocalDb once the blob is readable — every boot path.
export function restoreLocalSettingsFromDb(db) {
  const filled = [];
  try {
    const mirror = db?.[MIRROR_KEY]?.values;
    if (!mirror || typeof mirror !== "object") return filled;
    for (const key of BACKUP_LS_KEYS) {
      if (!(key in mirror)) continue;
      let cur = null;
      try { cur = localStorage.getItem(key); } catch { return filled; }
      if (cur !== null) continue; // present → localStorage wins
      const v = mirror[key];
      if (typeof v !== "string") continue;
      try { localStorage.setItem(key, v); filled.push(key); } catch { /* quota */ }
    }
  } catch (e) {
    console.warn("[localSettingsMirror] restore failed", e);
  }
  if (filled.length) {
    try {
      // Runtime stores re-read localStorage on these. ThemeContext already
      // listens for the first; accessibility re-inits on the second.
      window.dispatchEvent(new Event("symphony-theme-storage-change"));
      window.dispatchEvent(new CustomEvent(RESTORED_EVENT, { detail: { keys: filled } }));
    } catch { /* SSR */ }
    console.info(`[localSettingsMirror] restored ${filled.length} preference(s) from the on-device mirror:`, filled);
  }
  return filled;
}

// Hook the runtime so any allow-listed localStorage write is mirrored
// shortly after. localStorage has no same-tab change event, so wrap
// setItem/removeItem once (idempotent). Cross-tab writes arrive via the
// native `storage` event and are mirrored too.
export function installLocalSettingsMirror(getDb, saveDb) {
  if (_hooked || typeof window === "undefined") return;
  _hooked = true;
  const keys = new Set(BACKUP_LS_KEYS);
  try {
    const proto = Object.getPrototypeOf(window.localStorage);
    const origSet = proto.setItem;
    const origRemove = proto.removeItem;
    proto.setItem = function (k, v) {
      const r = origSet.call(this, k, v);
      if (this === window.localStorage && keys.has(k)) scheduleMirror(getDb, saveDb);
      return r;
    };
    proto.removeItem = function (k) {
      const r = origRemove.call(this, k);
      if (this === window.localStorage && keys.has(k)) scheduleMirror(getDb, saveDb);
      return r;
    };
  } catch (e) {
    console.warn("[localSettingsMirror] could not hook localStorage", e);
  }
  window.addEventListener("storage", (e) => { if (e.key && keys.has(e.key)) scheduleMirror(getDb, saveDb); });
  // Also mirror once shortly after install so an existing install (whose
  // preferences were set before this shipped) gets a first snapshot.
  scheduleMirror(getDb, saveDb, 4000);
}

export const LOCAL_SETTINGS_RESTORED_EVENT = RESTORED_EVENT;
