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
import { stripDeviceBound } from "@/lib/backupPolicy";
import { getAllLocalImages } from "@/lib/localImageStorage";
import { getAllLocalFonts } from "@/lib/localFontStorage";
import { readBackupLocalSettings } from "@/lib/backupKeys";
import { isNative } from "@/lib/platform";
import { shareFile, writeFileToDocumentsSilent } from "@/lib/shareFile";
import { saveBlobToPublicDownloads } from "@/lib/nativeMediaStoreSave";
import { recordBackupAttempt, snoozeBackupWarning } from "@/lib/backupHealth";
import { hasMultipleSystems } from "@/lib/systems";
import { isEncryptionEnabled, getSessionPassword } from "@/lib/storageMode";
import { encryptStandardBackup } from "@/lib/backupFormat";

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

// ── The backup DECISION (v0.240.0) ───────────────────────────────────
// Auto-backup defaults to OFF, on purpose: a silent plaintext file in a
// public Downloads folder can out a user whose phone someone else picks
// up — the same threat the grocery-list panic cover exists for. But "off
// because nobody asked" is how a tester lost everything to a storage
// wipe. So the default stays off AND every user is asked, once, in a
// step they can't skip past: automatic / remind me / not now. The answer
// is recorded here so the app knows the question was actually put.
//
// Not mirrored into the DB blob: if a wipe erases it, re-asking is the
// right outcome. Users from before this existed are inferred to have
// decided if they already had an interval set.
const DECISION_KEY = "symphony_backup_decision_v1";
export const BACKUP_DECISIONS = {
  AUTO: "auto",
  REMINDER: "reminder",
  DECLINED: "declined",
};

export function getBackupDecision() {
  try {
    const v = localStorage.getItem(DECISION_KEY);
    if (Object.values(BACKUP_DECISIONS).includes(v)) return v;
  } catch { /* storage off */ }
  return null;
}

export function hasBackupDecision() {
  if (getBackupDecision()) return true;
  // Pre-decision installs that turned auto-backup on already chose.
  return getAutoBackupInterval() > 0;
}

// Records the choice and applies it. "declined" snoozes the home-screen
// health card for a few days so the user isn't nagged the moment after
// saying "not now" — it comes back after that, which is the reminder they
// consented to.
export function recordBackupDecision(decision, { intervalDays = 7 } = {}) {
  if (!Object.values(BACKUP_DECISIONS).includes(decision)) return;
  if (decision === BACKUP_DECISIONS.DECLINED) {
    setAutoBackupMode(BACKUP_MODES.OFF);
    snoozeBackupWarning(3);
  } else {
    setAutoBackupInterval(intervalDays > 0 ? intervalDays : 7);
    // Reminder mode is native-only; web falls back to auto (matches Settings).
    setAutoBackupMode(decision === BACKUP_DECISIONS.REMINDER && isNative() ? BACKUP_MODES.REMINDER : BACKUP_MODES.AUTO);
  }
  try { localStorage.setItem(DECISION_KEY, decision); } catch { /* non-fatal */ }
}

// ── Backup-file privacy (v0.240.0) ───────────────────────────────────
// Two independent knobs, both off by default so nothing changes for
// existing files until the user opts in:
//
//   Locking — the whole standard envelope is sealed with AES-256-GCM
//   (see encryptStandardBackup). "storage" reuses the at-rest password
//   (never stored anywhere extra — read from the unlocked session);
//   "custom" is a separate password kept in localStorage. The custom
//   password key is deliberately NOT in BACKUP_LS_KEYS: mirroring it
//   would write the password into the very file it protects, and into
//   every plain export. If it goes missing the backup FAILS LOUDLY
//   (health card → "failing" with the reason) rather than silently
//   writing plaintext — the user's explicit choice wins over convenience.
//
//   Naming — the file name prefix. The default names the app; a plain
//   name (e.g. "notes-2026-09-23.json") doesn't. On native a non-default
//   name also moves the file out of "Downloads/Oceans Symphony" into a
//   neutral "Downloads/Backups" folder. Restore detects format by file
//   CONTENT, so any name imports fine.
const ENCRYPT_KEY = "symphony_autobackup_encrypt";
const CUSTOM_PW_KEY = "symphony_autobackup_pw_v1";
export const BACKUP_ENCRYPTION = {
  OFF: "off",
  STORAGE: "storage",
  CUSTOM: "custom",
};

export function getBackupEncryptionMode() {
  try {
    const v = localStorage.getItem(ENCRYPT_KEY);
    if (Object.values(BACKUP_ENCRYPTION).includes(v)) return v;
  } catch { /* non-fatal */ }
  return BACKUP_ENCRYPTION.OFF;
}

export function setBackupEncryptionMode(mode) {
  if (!Object.values(BACKUP_ENCRYPTION).includes(mode)) return;
  try { localStorage.setItem(ENCRYPT_KEY, mode); } catch { /* non-fatal */ }
  if (mode !== BACKUP_ENCRYPTION.CUSTOM) clearBackupCustomPassword();
}

export function hasBackupCustomPassword() {
  try { return !!localStorage.getItem(CUSTOM_PW_KEY); } catch { return false; }
}

export function setBackupCustomPassword(pw) {
  try { localStorage.setItem(CUSTOM_PW_KEY, String(pw || "")); } catch { /* non-fatal */ }
}

export function clearBackupCustomPassword() {
  try { localStorage.removeItem(CUSTOM_PW_KEY); } catch { /* non-fatal */ }
}

// The password a backup should be sealed with right now, or a
// human-readable reason there isn't one. Never returns plaintext when the
// user asked for locking — a missing password is a failure, not a downgrade.
function resolveBackupPassword() {
  const mode = getBackupEncryptionMode();
  if (mode === BACKUP_ENCRYPTION.OFF) return { password: null };
  if (mode === BACKUP_ENCRYPTION.STORAGE) {
    if (!isEncryptionEnabled()) {
      return { error: "backup locking is set to your storage password, but storage encryption is off — pick a backup password in Settings → Data & privacy → Auto-backup" };
    }
    const pw = getSessionPassword();
    if (!pw) return { error: "storage password isn't available this session — unlock the app again, then back up" };
    return { password: pw };
  }
  let pw = null;
  try { pw = localStorage.getItem(CUSTOM_PW_KEY); } catch { /* storage off */ }
  if (!pw) return { error: "backup password is missing on this device — set it again in Settings → Data & privacy → Auto-backup" };
  return { password: pw };
}

const NAME_KEY = "symphony_autobackup_name_v1";
export const DEFAULT_BACKUP_NAME = "oceans-symphony-backup";
export const DISCREET_BACKUP_NAME = "notes";
const NEUTRAL_SUBDIR = "Backups";

// Keeps a user-typed prefix safe as a file name: letters, digits, space,
// dash, underscore; trimmed; bounded. Empty → default.
export function sanitizeBackupName(raw) {
  const cleaned = String(raw || "").replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 40);
  return cleaned || DEFAULT_BACKUP_NAME;
}

export function getBackupName() {
  try {
    const v = localStorage.getItem(NAME_KEY);
    if (v) return sanitizeBackupName(v);
  } catch { /* non-fatal */ }
  return DEFAULT_BACKUP_NAME;
}

export function setBackupName(raw) {
  const name = sanitizeBackupName(raw);
  try {
    if (name === DEFAULT_BACKUP_NAME) localStorage.removeItem(NAME_KEY);
    else localStorage.setItem(NAME_KEY, name);
  } catch { /* non-fatal */ }
}

export function isDiscreetBackupName() {
  return getBackupName() !== DEFAULT_BACKUP_NAME;
}

// Where a native backup lands, as shown to the user ("Downloads → …").
export function describeBackupFolder() {
  return isDiscreetBackupName() ? `Downloads → ${NEUTRAL_SUBDIR}` : "Downloads → Oceans Symphony";
}

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

// Above this many total bytes across images + fonts, the auto-backup
// drops those heavy blobs from the payload — testers with dozens of
// alter avatars were crossing the WebView OOM ceiling as the plugin
// bridge tried to marshal the whole base64 string in one call, killing
// the app mid-boot. Data (entities + settings) still ships, so the
// user's real records are always safe; images can be re-exported by
// hand from Settings → Data & privacy → Export → Advanced → Images.
// 12 MB of raw base64 is roughly the ceiling we've seen the bridge
// survive across Android WebView versions we ship on.
const AUTO_BACKUP_HEAVY_BLOB_LIMIT_BYTES = 12 * 1024 * 1024;

function estimateBytes(obj) {
  // JSON size upper bound without stringifying the whole thing (which
  // would defeat the memory-savings point). Each data-URI string in
  // localImages/localFonts is already a string, so summing string
  // lengths is a good-enough estimate for the guard.
  let n = 0;
  try {
    for (const v of Object.values(obj || {})) {
      if (typeof v === "string") n += v.length;
    }
  } catch { /* estimate is best-effort — don't let it throw */ }
  return n;
}

async function buildFullBackupPayload() {
  // Device-bound entities (friends credential + E2E private key, push
  // registration) must never ride in a general backup — see backupPolicy.
  // Manual exports already stripped them; auto-backups did NOT until
  // v0.95.2, which meant a plain-JSON file in Downloads carried the
  // friends secret. The identity moves only via the explicit opt-in
  // bundle in the manual export flow.
  const dump = stripDeviceBound(getFullDbDump());
  let images = {};
  try { images = await getAllLocalImages(); } catch { /* skip images on failure */ }
  let fonts = {};
  try { fonts = await getAllLocalFonts(); } catch { /* skip fonts on failure */ }
  const heavyBytes = estimateBytes(images) + estimateBytes(fonts);
  const skipHeavy = heavyBytes > AUTO_BACKUP_HEAVY_BLOB_LIMIT_BYTES;
  if (skipHeavy) {
    console.warn(
      `[Auto-backup] payload too large (${Math.round(heavyBytes / 1024 / 1024)} MB of images/fonts) — writing data-only backup so the native bridge doesn't crash.`
    );
  }
  const payload = {
    __format: "symphony_backup",
    __version: 1,
    __exported_at: new Date().toISOString(),
    __auto: true,
    // A skip is recorded on the envelope so the user can see WHY their
    // auto-backup is smaller than they expect when they open the file.
    ...(skipHeavy ? { __skipped_heavy_blobs: true } : {}),
    data: dump,
    __local_images: skipHeavy ? {} : images,
    __local_fonts: skipHeavy ? {} : fonts,
    __local_settings: readBackupLocalSettings(),
  };
  // Caveats the health surface must be able to say out loud (they used to
  // be a console.warn and a flag inside the file — invisible in-app):
  //   • images/fonts skipped over the size limit
  //   • only the ACTIVE system is in an auto-backup (multi-system users)
  let multi = false;
  try { multi = hasMultipleSystems(); } catch { /* registry unavailable */ }
  Object.defineProperty(payload, "__caveats", { enumerable: false, value: { skippedHeavy: skipHeavy, activeSystemOnly: multi } });
  return payload;
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
  const kind = silent ? "auto" : "manual";
  // Locking is resolved BEFORE the (expensive) payload is built, so a
  // missing password fails fast and is recorded like any other failure.
  const { password, error: pwError } = resolveBackupPassword();
  if (pwError) {
    recordBackupAttempt({ kind, ok: false, detail: pwError });
    if (!silent) {
      try { const { toast } = await import("sonner"); toast.error(`Backup failed: ${pwError}`); } catch { /* sonner not available */ }
    }
    const err = new Error(pwError);
    err.deliveryResult = "failed";
    throw err;
  }
  let payload = await buildFullBackupPayload();
  const caveats = payload.__caveats || {};
  const locked = !!password;
  if (locked) payload = await encryptStandardBackup(payload, password);
  const json = JSON.stringify(payload);
  const date = new Date().toISOString().slice(0, 10);
  const name = getBackupName();
  const discreet = name !== DEFAULT_BACKUP_NAME;
  const filename = `${name}-${date}.json`;
  const shareTitle = discreet ? "Backup" : "Oceans Symphony backup";
  const blob = new Blob([json], { type: "application/json" });

  const destination = getBackupDestination();
  let result = "failed";
  let error = null;
  let location = null;

  if (isNative() && destination === BACKUP_DESTINATIONS.DOCUMENTS) {
    // Preferred path: MediaStore.Downloads via our custom Java
    // plugin. Works without a permission prompt on Android 10+ AND
    // survives uninstall (the whole point of an auto-backup). A plain
    // file name also gets a plain folder — see the naming note above.
    const mediaRes = await saveBlobToPublicDownloads({
      blob,
      filename,
      mimeType: "application/json",
      ...(discreet ? { subdir: NEUTRAL_SUBDIR } : {}),
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
          title: shareTitle,
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
      title: shareTitle,
      dialogTitle: "Save backup file",
    });
    result = fb.result;
    error = fb.error;
  }

  if (result === "filesystem" || result === "shared" || result === "downloaded") {
    setAutoBackupLastAt(new Date().toISOString());
    const notes = [];
    if (caveats.activeSystemOnly) notes.push("active system only");
    if (caveats.skippedHeavy) notes.push("images/fonts skipped (too large)");
    recordBackupAttempt({ kind, ok: true, detail: [location || result, ...(locked ? ["password-locked"] : []), ...notes].join(" · "), partial: notes.length > 0 });
  } else if (result === "failed") {
    // "cancelled" is the user's choice, not a failure — don't count it.
    recordBackupAttempt({ kind, ok: false, detail: error || "delivery failed" });
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
    // The delivery step already recorded its own failure; a throw from
    // BUILDING the payload (before delivery) would not have — record it
    // so it can't be silent. Idempotent-ish: two consecutive failure rows
    // for one attempt only strengthens the same "failing" verdict.
    if (!e?.deliveryResult) recordBackupAttempt({ kind: "auto", ok: false, detail: e?.message || "build failed" });
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
