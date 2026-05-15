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
import { readBackupLocalSettings } from "@/lib/backupKeys";
import { isNative } from "@/lib/platform";

const INTERVAL_KEY = "symphony_autobackup_interval_days";
const LAST_KEY = "symphony_autobackup_last_at";
// Backup *mode* controls how the file is delivered.
//   - "off":      no scheduled backups (only manual + on-recovery)
//   - "auto":     runs silently on app open if interval has elapsed
//                 (native → writes to Documents; web/TWA → Web Share /
//                 anchor download as before)
//   - "reminder": [native only] schedules a recurring OS notification
//                 at the interval; tapping it opens the app and runs
//                 the backup immediately. Falls back to "auto" on web.
// Stored separately from the interval so flipping mode doesn't reset
// the user's chosen frequency.
const MODE_KEY = "symphony_autobackup_mode";
export const BACKUP_MODES = {
  OFF: "off",
  AUTO: "auto",
  REMINDER: "reminder",
};

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

export function getAutoBackupMode() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === BACKUP_MODES.REMINDER || v === BACKUP_MODES.AUTO || v === BACKUP_MODES.OFF) return v;
  } catch { /* non-fatal */ }
  // Default: "auto" if the user had an interval set previously (preserves
  // pre-mode behaviour), otherwise "off".
  return getAutoBackupInterval() > 0 ? BACKUP_MODES.AUTO : BACKUP_MODES.OFF;
}

export function setAutoBackupMode(mode) {
  if (![BACKUP_MODES.OFF, BACKUP_MODES.AUTO, BACKUP_MODES.REMINDER].includes(mode)) return;
  try { localStorage.setItem(MODE_KEY, mode); }
  catch { /* non-fatal */ }
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
    __local_settings: readBackupLocalSettings(),
  };
}

// Native delivery: write directly to a documents folder via the
// Capacitor Filesystem plugin. Skips the Web Share UI entirely — no
// tap, no chooser, no surprise. Returns "filesystem" on success, or
// null if the plugin path fails so the caller can fall back to the
// web-style share/download.
async function deliverBackupNative(filename, json) {
  if (!isNative()) return null;
  try {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    // Use the app's Documents directory (Directory.Documents). On
    // Android this maps to /storage/emulated/0/Documents/<app>/, which
    // is public storage and survives "Clear app data" — the whole
    // point of an auto-backup.
    await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return "filesystem";
  } catch (e) {
    console.warn("[Auto-backup] native filesystem write failed:", e);
    return null;
  }
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
//
// preferNative: when true (the auto-backup path), try the silent
// Filesystem write before falling back to Web Share. Manual "Back up
// now" leaves this false so the user gets the standard share sheet —
// they explicitly asked for it.
export async function runAutoBackupNow({ silent = false, preferNative = false } = {}) {
  const payload = await buildFullBackupPayload();
  const json = JSON.stringify(payload);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `oceans-symphony-backup-${date}.json`;

  let result = null;
  if (preferNative && isNative()) {
    result = await deliverBackupNative(filename, json);
  }
  if (!result) {
    result = await deliverBackup(filename, json);
  }

  if (result !== "cancelled") setAutoBackupLastAt(new Date().toISOString());
  if (!silent) {
    try {
      const { toast } = await import("sonner");
      if (result === "filesystem") toast.success("Backup saved to Documents");
      else if (result === "shared") toast.success("Backup saved");
      else if (result === "downloaded") toast.success("Backup downloaded");
    } catch { /* sonner not available, ignore */ }
  }
  return result;
}

// True if the configured interval has elapsed since the last backup.
// Shared between the on-boot check and the native reminder-notification
// reconciler so they agree on "is a backup due right now".
export function isAutoBackupDue() {
  const interval = getAutoBackupInterval();
  if (interval <= 0) return false;
  const last = getAutoBackupLastAt();
  if (!last) return true;
  const lastMs = Date.parse(last);
  if (!Number.isFinite(lastMs)) return true;
  const diffDays = (Date.now() - lastMs) / (1000 * 60 * 60 * 24);
  return diffDays >= interval;
}

// Called on app boot. Quietly runs a backup if the user has the
// feature in "auto" mode AND enough time has passed since their last
// one. "reminder" mode handles its own delivery via OS notification;
// "off" does nothing here.
export async function runAutoBackupIfDue() {
  const mode = getAutoBackupMode();
  if (mode !== BACKUP_MODES.AUTO) return false;
  if (!isAutoBackupDue()) return false;
  try {
    // Native: write straight to Documents (silent, no chooser). Web:
    // existing Web Share / anchor download path.
    await runAutoBackupNow({ silent: true, preferNative: true });
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
