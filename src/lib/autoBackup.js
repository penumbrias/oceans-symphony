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
import { getAllLocalFonts } from "@/lib/localFontStorage";
import { readBackupLocalSettings } from "@/lib/backupKeys";
import { isNative } from "@/lib/platform";
import { shareFile, writeFileToDocumentsSilent } from "@/lib/shareFile";
import { saveBlobToPublicDownloads } from "@/lib/nativeMediaStoreSave";

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

// Native-only: where the backup file actually lands.
//   - "documents": silent write to the OS Documents folder via
//                  @capacitor/filesystem. No share-sheet prompt.
//                  File shows up in Files app → Internal storage →
//                  Documents (or Android/data/<pkg>/Documents on
//                  scoped-storage Android 11+, still visible to the
//                  user). Best default — backups land in a known
//                  spot without interrupting the user every time
//                  auto-backup fires.
//   - "ask":       hand the file to the system share sheet so the
//                  user picks where it goes (Files / Drive / email
//                  / etc) on each backup. Existing behaviour pre-
//                  0.14.x. Default on web because we don't have
//                  Filesystem there.
const DESTINATION_KEY = "symphony_autobackup_destination";
export const BACKUP_DESTINATIONS = {
  DOCUMENTS: "documents",
  ASK: "ask",
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

export function getBackupDestination() {
  try {
    const v = localStorage.getItem(DESTINATION_KEY);
    if (v === BACKUP_DESTINATIONS.DOCUMENTS || v === BACKUP_DESTINATIONS.ASK) return v;
  } catch { /* non-fatal */ }
  // Native: silent write to Documents is the natural default — the
  // user is on a real OS and expects auto-backups to "just save
  // somewhere I can find later". Web/TWA: only the share-sheet path
  // works.
  return isNative() ? BACKUP_DESTINATIONS.DOCUMENTS : BACKUP_DESTINATIONS.ASK;
}

export function setBackupDestination(value) {
  if (![BACKUP_DESTINATIONS.DOCUMENTS, BACKUP_DESTINATIONS.ASK].includes(value)) return;
  try { localStorage.setItem(DESTINATION_KEY, value); }
  catch { /* non-fatal */ }
}

async function buildFullBackupPayload() {
  const dump = getFullDbDump();
  let images = {};
  try { images = await getAllLocalImages(); } catch { /* skip images on failure */ }
  let fonts = {};
  try { fonts = await getAllLocalFonts(); } catch { /* skip fonts on failure */ }
  return {
    __format: "symphony_backup",
    __version: 1,
    __exported_at: new Date().toISOString(),
    __auto: true,
    data: dump,
    __local_images: images,
    __local_fonts: fonts,
    __local_settings: readBackupLocalSettings(),
  };
}

// Run a backup right now. Two delivery paths:
//   - BACKUP_DESTINATIONS.DOCUMENTS (native only): silent write
//     straight to Filesystem.Documents. On failure, falls back to
//     the share sheet so the backup attempt still succeeds.
//   - BACKUP_DESTINATIONS.ASK: hand the file to shareFile (system
//     share sheet on native, navigator.share/anchor on web).
//
// Returns the result string ("filesystem" | "shared" | "downloaded"
// | "cancelled" | "failed").
export async function runAutoBackupNow({ silent = false } = {}) {
  const payload = await buildFullBackupPayload();
  const json = JSON.stringify(payload);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `oceans-symphony-backup-${date}.json`;
  const blob = new Blob([json], { type: "application/json" });

  const destination = getBackupDestination();
  let result = "failed";
  let error = null;
  let location = null;

  if (isNative() && destination === BACKUP_DESTINATIONS.DOCUMENTS) {
    // Preferred path: MediaStore.Downloads via our custom Java
    // plugin. Works without a permission prompt on Android 10+ AND
    // survives uninstall (the whole point of an auto-backup).
    const mediaRes = await saveBlobToPublicDownloads({
      blob,
      filename,
      mimeType: "application/json",
    });
    if (mediaRes.result === "filesystem") {
      result = mediaRes.result;
      location = mediaRes.location;
    } else {
      // Fallback 1: Filesystem.Documents direct. Likely fails on
      // Android 11+ scoped storage too, but worth a shot on older
      // devices where legacy storage permits it (and the file lands
      // in /storage/emulated/0/Documents/, also surviving uninstall).
      console.warn("[Auto-backup] MediaStore failed, trying Filesystem.Documents:", mediaRes.error);
      const silentRes = await writeFileToDocumentsSilent({ blob, filename });
      if (silentRes.result === "filesystem") {
        result = silentRes.result;
        location = silentRes.location;
      } else {
        // Fallback 2: share sheet. Last resort — gives the user a
        // chance to file the backup somewhere themselves. We
        // deliberately do NOT silently write into the app-scoped
        // External directory because that gets wiped on uninstall,
        // defeating the point of having a backup.
        console.warn("[Auto-backup] Documents also failed, falling back to share sheet:", silentRes.error);
        const fb = await shareFile({
          blob,
          filename,
          title: "Oceans Symphony backup",
          dialogTitle: "Save backup file",
        });
        result = fb.result;
        error = fb.error;
      }
    }
  } else {
    const fb = await shareFile({
      blob,
      filename,
      title: "Oceans Symphony backup",
      dialogTitle: "Save backup file",
    });
    result = fb.result;
    error = fb.error;
  }

  if (result === "filesystem" || result === "shared" || result === "downloaded") {
    setAutoBackupLastAt(new Date().toISOString());
  }
  if (!silent) {
    try {
      const { toast } = await import("sonner");
      if (result === "filesystem") {
        // location can be "Downloads/Oceans Symphony" (MediaStore
        // path on Android 10+) or "Documents" (legacy fallback on
        // Android <= 9). Both survive uninstall, so the user can
        // trust the toast no matter which path won.
        toast.success(
          location
            ? `Backup saved to ${location}`
            : "Backup saved"
        );
      }
      else if (result === "shared") toast.success("Backup saved — pick a destination in the share sheet");
      else if (result === "downloaded") toast.success("Backup downloaded");
      else if (result === "cancelled") toast.info("Backup canceled");
      else toast.error(`Backup failed${error ? `: ${error}` : ""}`);
    } catch { /* sonner not available */ }
  }
  if (result === "failed") {
    const err = new Error(error || "backup_delivery_failed");
    err.deliveryResult = result;
    throw err;
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
    // existing Web Share / anchor download path. Both routes are
    // baked into runAutoBackupNow now — no preferNative flag.
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
