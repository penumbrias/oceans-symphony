// Auto-backup orchestrator.
//
// On Android (and any environment where the user installed the app as a
// PWA / TWA), the WebView's IndexedDB and localStorage can be wiped by
// events outside our control:
//   - Manual "Clear app data" / "Clear storage" via the OS app info.
//   - Device-care / cleaner apps (Samsung Device Care, OPPO Phone Manager, …)
//     that aggressively reclaim WebView state.
//   - App updates that change storage scope (signing config, manifest id,
//     Bubblewrap isolation flags, …).
//   - Low-storage automatic cleanups by Android.
//   - Switching between Chrome tab and an installed TWA when those
//     ended up in different storage scopes for that origin.
//
// Asking the browser to persist storage helps but isn't bulletproof —
// only an off-WebView copy of the data is guaranteed to survive every
// scenario above. The auto-backup feature here writes a full JSON dump
// of the user's data to the device's Downloads folder on a schedule
// they pick. The Downloads folder is on Android's public storage, not
// inside the WebView's sandbox, so it survives all of the cases listed.

import { getFullDbDump } from "@/lib/localDb";
import { getAllLocalImages } from "@/lib/localImageStorage";

const INTERVAL_KEY = "symphony_autobackup_interval_days";
const LAST_KEY = "symphony_autobackup_last_at";

// LocalStorage keys to roll into the backup. Mirrors the manual export
// in DataBackupRestore.jsx — if you add a new key there, add it here
// too so the auto-backup payload stays equivalent to the manual one.
const LS_BACKUP_KEYS = [
  "symphony_themeMode",
  "symphony_selectedTheme",
  "symphony_customColors",
  "symphony_selectedFont",
  "symphony_userCustomPresets",
  "symphony_alterThemeLinks",
  "symphony_a11y_fontSize",
  "symphony_a11y_fontFamily",
  "symphony_a11y_reduceMotion",
  "symphony_a11y_highContrast",
  "symphony_a11y_largeTouch",
  "symphony_a11y_navHeight",
  "alter_hide_grouped",
  "alter_grid_cols",
  "alter_display_mode",
  "nav_grid_layout",
  "nav_grid_cols",
  "nav_display_mode",
];

// User-pickable backup intervals. 0 means off.
export const AUTO_BACKUP_INTERVALS = [
  { value: 0, label: "Off" },
  { value: 1, label: "Daily" },
  { value: 7, label: "Weekly" },
  { value: 14, label: "Every 2 weeks" },
  { value: 30, label: "Monthly" },
];

export function getAutoBackupInterval() {
  try {
    const raw = localStorage.getItem(INTERVAL_KEY);
    const v = parseInt(raw, 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch { return 0; }
}

export function setAutoBackupInterval(days) {
  try { localStorage.setItem(INTERVAL_KEY, String(Math.max(0, days | 0))); }
  catch { /* localStorage full or disabled — non-fatal */ }
}

export function getAutoBackupLastAt() {
  try { return localStorage.getItem(LAST_KEY) || null; }
  catch { return null; }
}

function setAutoBackupLastAt(iso) {
  try { localStorage.setItem(LAST_KEY, iso); }
  catch { /* non-fatal */ }
}

function exportLocalSettings() {
  const out = {};
  for (const key of LS_BACKUP_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) out[key] = val;
  }
  return out;
}

async function buildFullBackupPayload() {
  const dump = getFullDbDump();
  let images = {};
  try { images = await getAllLocalImages(); } catch { /* skip images on failure */ }
  return {
    __format: "symphony_backup",
    __version: 1,
    __exported_at: new Date().toISOString(),
    __auto: true,
    data: dump,
    __local_images: images,
    __local_settings: exportLocalSettings(),
  };
}

async function deliverBackup(filename, json) {
  const blob = new Blob([json], { type: "application/json" });
  // Web Share API (Android Chrome / TWA): lets the user file it under
  // any installed sharing target (Files, Drive, Dropbox, etc.). On
  // Android the Files target writes to the Downloads folder.
  if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: "application/json" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Oceans Symphony backup" });
        return "shared";
      } catch (e) {
        if (e.name === "AbortError") return "cancelled";
        // fall through to anchor download
      }
    }
  }
  // Standard browser download. On Android Chrome / TWA, anchor
  // downloads go to the public Downloads folder by default.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

// Run a backup right now. Returns the delivery result string.
export async function runAutoBackupNow({ silent = false } = {}) {
  const payload = await buildFullBackupPayload();
  const json = JSON.stringify(payload);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `oceans-symphony-backup-${date}.json`;
  const result = await deliverBackup(filename, json);
  if (result !== "cancelled") setAutoBackupLastAt(new Date().toISOString());
  if (!silent) {
    try {
      const { toast } = await import("sonner");
      if (result === "shared") toast.success("Backup saved");
      else if (result === "downloaded") toast.success("Backup downloaded");
    } catch { /* sonner not available, ignore */ }
  }
  return result;
}

// Called on app boot. Quietly runs a backup if the user has the
// feature enabled AND enough time has passed since their last one.
export async function runAutoBackupIfDue() {
  const interval = getAutoBackupInterval();
  if (interval <= 0) return false; // feature off
  const last = getAutoBackupLastAt();
  if (last) {
    const lastMs = Date.parse(last);
    if (Number.isFinite(lastMs)) {
      const diffDays = (Date.now() - lastMs) / (1000 * 60 * 60 * 24);
      if (diffDays < interval) return false;
    }
  }
  try {
    await runAutoBackupNow({ silent: true });
    return true;
  } catch (e) {
    console.warn("[Auto-backup] failed:", e);
    return false;
  }
}

// Asks the browser to mark our storage as "persistent". When granted
// (which Android Chrome / Chrome WebView does for installed PWAs /
// TWAs), the storage is no longer subject to automatic eviction under
// pressure. Doesn't help with explicit "Clear app data" or with
// device-care / cleaner apps, but it eliminates the silent eviction
// category. Idempotent — the browser caches the answer.
export async function requestPersistentStorage() {
  try {
    if (typeof navigator === "undefined") return false;
    if (!navigator.storage?.persist) return false;
    const granted = await navigator.storage.persist();
    return !!granted;
  } catch (e) {
    console.warn("[Storage] persist() error:", e);
    return false;
  }
}

// Read-only probe of the browser's reported storage state. Used in
// Settings to show the user whether their storage is persistent and
// roughly how much space the app is using.
export async function getStorageState() {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    return {
      persisted,
      usage: estimate?.usage ?? null,
      quota: estimate?.quota ?? null,
    };
  } catch {
    return { persisted: null, usage: null, quota: null };
  }
}
