// Off-device backup copy.
//
// A backup in Downloads survives a wiped app, but not a lost, stolen or
// broken phone. This keeps a second copy of every backup somewhere the
// user picks that lives OFF the device:
//
//   Android  — one file, chosen once through the system "save as" picker
//              (BackupCopyPlugin.java). Any storage provider the phone
//              has works: Google Drive, OneDrive, Dropbox, Nextcloud, an
//              SD card. Drive offers file grants but not folder grants,
//              so it is one file, overwritten by each backup.
//   Desktop  — a folder (usually the Google Drive / OneDrive / Dropbox
//              folder on the computer); each backup lands as a dated file.
//   Browser / iOS — not offered: a tab can't keep access to a file
//              between visits. The save prompt already lets people pick
//              Drive each time.
//
// The copy is the same bytes as the main backup — locked with the backup
// password when locking is on. It never replaces the main backup; it is in
// addition to it.
//
// SHRINK GUARD. The scary case for a single overwritten file: the app's
// storage is wiped (the very thing backups exist for), the app comes back
// up empty, and the next automatic backup overwrites the one good copy in
// Drive with an empty one. So the record count of every copy is remembered,
// and an automatic run that would replace it with a much smaller one is
// refused and reported instead. A manual "Back up now" asks first.
//
// Both keys are device-bound and deliberately NOT in BACKUP_LS_KEYS: a file
// grant only works on the device that got it.

import { isDesktop, isNative, getNativePlatform } from "@/lib/platform";

const TARGET_KEY = "symphony_backup_copy_v1";
const LAST_KEY = "symphony_backup_copy_last_v1";

// Below this many records the guard doesn't apply — a brand-new user's
// first few backups legitimately swing in size.
const SHRINK_MIN_RECORDS = 20;
const SHRINK_RATIO = 0.5;

function desktopBridge() {
  return isDesktop() ? globalThis.symphonyDesktop?.backupCopy || null : null;
}

let _plugin = null;
async function androidPlugin() {
  if (_plugin) return _plugin;
  const { registerPlugin } = await import("@capacitor/core");
  _plugin = registerPlugin("BackupCopy");
  return _plugin;
}

// Which kind of copy this build can keep, or null.
export function backupCopyKind() {
  if (desktopBridge()) return "desktop-folder";
  if (isNative() && getNativePlatform() === "android") return "android-file";
  return null;
}

export function backupCopyAvailable() {
  return backupCopyKind() !== null;
}

export function getBackupCopyTarget() {
  try {
    const raw = localStorage.getItem(TARGET_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (!t || typeof t !== "object") return null;
    if (t.kind === "android-file" && t.uri) return t;
    if (t.kind === "desktop-folder" && t.path) return t;
  } catch { /* unreadable → no target */ }
  return null;
}

function setBackupCopyTarget(t) {
  try {
    if (t) localStorage.setItem(TARGET_KEY, JSON.stringify(t));
    else localStorage.removeItem(TARGET_KEY);
  } catch { /* non-fatal */ }
  try { localStorage.removeItem(LAST_KEY); } catch { /* non-fatal */ }
  try { window.dispatchEvent(new Event("symphony:backup-copy-changed")); } catch { /* SSR */ }
}

// What to show the user for the stored target.
export function describeBackupCopyTarget(t = getBackupCopyTarget()) {
  if (!t) return "";
  if (t.kind === "android-file") return t.provider ? `${t.name} in ${t.provider}` : t.name || "Chosen file";
  return t.path;
}

export function getBackupCopyLast() {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
    return v && typeof v === "object" ? v : null;
  } catch { return null; }
}

function setBackupCopyLast(v) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* non-fatal */ }
}

// Opens the picker. Returns the new target, or null if cancelled. Throws a
// user-facing Error when the platform refuses.
export async function chooseBackupCopyTarget({ suggestedName = "backup" } = {}) {
  const kind = backupCopyKind();
  if (kind === "desktop-folder") {
    const res = await desktopBridge().pickFolder();
    if (!res?.ok) throw new Error(res?.error || "Couldn't open the folder picker.");
    if (!res.path) return null;
    const t = { kind, path: res.path, name: res.path };
    setBackupCopyTarget(t);
    return t;
  }
  if (kind === "android-file") {
    const plugin = await androidPlugin();
    const prev = getBackupCopyTarget();
    const res = await plugin.pickFile({ suggestedName: `${suggestedName}.json` });
    if (!res || res.cancelled || !res.uri) return null;
    const t = { kind, uri: res.uri, name: res.name || "backup file", provider: res.provider || "" };
    setBackupCopyTarget(t);
    // Let go of the old file's grant (Android caps how many an app keeps).
    if (prev?.uri && prev.uri !== t.uri) {
      try { await plugin.release({ uri: prev.uri }); } catch { /* best effort */ }
    }
    return t;
  }
  throw new Error("This version of the app can't keep a backup copy elsewhere. Use the save prompt to put backups in Drive.");
}

// Stops making copies. The file or folder that was written is left alone —
// it's the user's backup.
export async function clearBackupCopyTarget() {
  const prev = getBackupCopyTarget();
  setBackupCopyTarget(null);
  if (prev?.kind === "android-file") {
    try { await (await androidPlugin()).release({ uri: prev.uri }); } catch { /* best effort */ }
  }
}

// Total records in a (plain, unencrypted) backup payload, single or
// multi-system. Top-level "__" keys are bookkeeping, not records.
export function countPayloadRecords(payload) {
  const countDump = (dump) => {
    let n = 0;
    for (const [k, v] of Object.entries(dump || {})) {
      if (k.startsWith("__") || !v || typeof v !== "object") continue;
      n += Array.isArray(v) ? v.length : Object.keys(v).length;
    }
    return n;
  };
  if (Array.isArray(payload?.systems)) return payload.systems.reduce((s, sys) => s + countDump(sys?.data), 0);
  return countDump(payload?.data);
}

// Would writing `records` now replace a copy that held far more?
export function backupCopyWouldShrink(records) {
  const last = getBackupCopyLast();
  if (!last || !Number.isFinite(last.records) || last.records < SHRINK_MIN_RECORDS) return null;
  if (records >= last.records * SHRINK_RATIO) return null;
  return { previous: last.records, now: records, at: last.at };
}

// Writes the copy. `text` is the exact backup file content (already locked
// when locking is on), `filename` its dated name. Returns
//   { ok: true, location }                — written
//   { ok: false, skipped: "shrink", … }   — refused by the guard
//   { ok: false, error }                  — failed
// Never throws. Pass force:true only after the user confirmed a shrink.
export async function writeBackupCopy({ text, filename, records, force = false }) {
  const t = getBackupCopyTarget();
  if (!t) return { ok: false, error: "no backup copy place chosen" };
  if (backupCopyKind() !== t.kind) return { ok: false, error: "the backup copy place was chosen in a different version of the app — choose it again" };
  if (!force && Number.isFinite(records)) {
    const shrink = backupCopyWouldShrink(records);
    if (shrink) {
      return {
        ok: false,
        skipped: "shrink",
        ...shrink,
        error: `not replaced — this backup has ${shrink.now} records, your copy has ${shrink.previous}. Back up now to replace it on purpose`,
      };
    }
  }
  try {
    if (t.kind === "desktop-folder") {
      const res = await desktopBridge().write(t.path, filename, text);
      if (!res?.ok) throw new Error(res?.error || "Couldn't write the backup copy.");
    } else {
      const plugin = await androidPlugin();
      await plugin.write({ uri: t.uri, data: text });
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
  if (Number.isFinite(records)) setBackupCopyLast({ records, at: new Date().toISOString() });
  return { ok: true, location: describeBackupCopyTarget(t) };
}
