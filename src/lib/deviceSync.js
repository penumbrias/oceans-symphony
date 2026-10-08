// Device sync — no cloud, no server, no network socket.
//
// Two devices exchange snapshot FILES in a folder the user picks. Plug a
// phone in over USB and point the desktop at its storage; or use a USB
// stick, or any local folder. The app never opens a connection to
// anything — "nothing leaves your devices" is guaranteed by construction
// here, not by policy.
//
// ── One file per device ───────────────────────────────────────────────
//
// Every device writes ONLY its own file and reads everyone else's. That
// removes write conflicts entirely: no two writers ever touch the same
// path, so there is no last-writer-wins race and no ".sync-conflict"
// copies to reconcile.
//
// Two files per device, split on purpose:
//   <prefix>.data.json   entities. Hot — rewritten whenever data changes.
//   <prefix>.media.json  images + fonts. Cold — rewritten only when the
//                        media set actually changes, so saving a status
//                        note doesn't rewrite 40MB of avatars.
//
// ── Merging is already solved ─────────────────────────────────────────
//
// mergeDbDump does per-record newer-wins on updated_date, folds the
// SystemSettings singleton field by field, and guards active fronting
// sessions. We call it with applyDeletions FALSE, always — see below.
//
// ── Sync never deletes ────────────────────────────────────────────────
//
// Owner's rule, and it is the right one for this app: someone may well be
// syncing precisely BECAUSE they want deleted data back. With
// applyDeletions false, incoming tombstones are ignored and local
// tombstones don't suppress incoming records — so syncing from a device
// that still has the record genuinely restores it. Deletions the other
// device made are surfaced for review (summariseIncomingDeletions) and
// never applied on their own.
//
// ── What is deliberately NOT synced ───────────────────────────────────
//
//   - Device-bound entities (FriendIdentity, PushSubscription) — stripped
//     on write by stripDeviceBound AND on read by mergeDbDump. Copying a
//     Friends identity to a second device is impersonation, not sync.
//   - Appearance and layout (owner's rule, Sept 2026: the desktop and the
//     phone are meant to look different). localStorage preferences and
//     the SystemSettings look/layout fields (src/lib/syncLook.js) travel
//     in a separate `appearance` section that NOTHING applies
//     automatically — only the explicit "Use another device's appearance"
//     action. The look fields are also stripped from incoming
//     SystemSettings rows, so an older peer that still sends them inside
//     the record can't restyle this device. (Before: preferences filled
//     gaps and the record merged newer-wins, so resizing a widget on the
//     desktop rewrote the phone's home layout.)
//     EXCEPT appearance presets (v0.252.1, owner): the saved presets in
//     `symphony_userCustomPresets` are merged in on every sync — a union
//     that never loses one (src/lib/syncPresets.js). Which preset is
//     active still stays per-device.
//     EXCEPT the widget boards (v0.249.0, owner): `ui_v2_home` and
//     `classic_home` travel with the data and merge page by page
//     (syncMerge.mergeBoards); each page's "Show as" sets its shape.
//   - The device id itself. See deviceIdentity below.

import { getFullDbDump, mergeDbDump, isEncryptionActive, encryptWithActiveKey, decryptWithActiveKey } from "@/lib/localDb";
import { stripDeviceBound, stripUnsharedSecrets } from "@/lib/backupPolicy";
import { getAllLocalImages, restoreLocalImages } from "@/lib/localImageStorage";
import { getAllLocalFonts, restoreLocalFonts } from "@/lib/localFontStorage";
import { getActiveSystemId } from "@/lib/systems";
import { readBackupLocalSettings } from "@/lib/backupKeys";
import { stripLookFromDump, pickLookFields } from "@/lib/syncLook";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { APP_VERSION } from "@/lib/appVersion";
import { getBuildTarget } from "@/lib/platform";
import { PRESETS_KEY, mergePeerPresets } from "@/lib/syncPresets";

export const SYNC_FORMAT = "symphony_sync";
export const SYNC_MEDIA_FORMAT = "symphony_sync_media";
export const SYNC_VERSION = 1;

// ── Device identity ───────────────────────────────────────────────────
//
// DELIBERATELY NOT in BACKUP_LS_KEYS, and not in the settings mirror.
// If the device id rode along in a backup, restoring onto a second
// machine would clone it — both devices would then write to the SAME
// filename and silently overwrite each other's snapshot, which is the one
// way a per-device-file scheme can lose data. Same reasoning as
// FriendIdentity being excluded from backups.
const DEVICE_ID_KEY = "symphony_sync_device_id";
const DEVICE_NAME_KEY = "symphony_sync_device_name";

function randomId() {
  try {
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // Storage unavailable — a stable-for-this-session id still lets the
    // user complete a manual sync rather than blocking entirely.
    return `ephemeral-${randomId()}`;
  }
}

function defaultDeviceName() {
  const target = getBuildTarget();
  if (target === "desktop") return "This computer";
  if (target === "native") return "This phone";
  return "This browser";
}

export function getDeviceName() {
  try {
    return localStorage.getItem(DEVICE_NAME_KEY) || defaultDeviceName();
  } catch {
    return defaultDeviceName();
  }
}

export function setDeviceName(name) {
  try {
    const clean = String(name || "").trim().slice(0, 60);
    if (clean) localStorage.setItem(DEVICE_NAME_KEY, clean);
    else localStorage.removeItem(DEVICE_NAME_KEY);
    return true;
  } catch {
    return false;
  }
}

// ── File naming ───────────────────────────────────────────────────────
//
// The system id is part of the name so two systems on one device don't
// collide on a single file. Everything the reader needs is ALSO inside
// the file — the name is for humans and for cheap listing.
const slug = (s) => String(s || "default").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);

export function syncFileBase(deviceId = getDeviceId(), systemId = getActiveSystemId()) {
  return `symphony-sync-${slug(systemId)}-${slug(deviceId)}`;
}

export const dataFileName = (deviceId, systemId) => `${syncFileBase(deviceId, systemId)}.data.json`;
export const mediaFileName = (deviceId, systemId) => `${syncFileBase(deviceId, systemId)}.media.json`;

// Recognises any device's sync file, so we can list what is in a folder.
export function parseSyncFileName(name) {
  const m = /^symphony-sync-(.+)-([^-]+)\.(data|media)\.json$/.exec(String(name || ""));
  if (!m) return null;
  return { systemId: m[1], deviceId: m[2], kind: m[3] };
}

// ── Envelope ──────────────────────────────────────────────────────────
//
// The header (who wrote it, when, which system) stays READABLE even when
// the body is encrypted, so the UI can list "Kane's phone, 2 hours ago"
// without a passphrase. Only the payload is ciphertext.
//
// Encryption mirrors the device's storage mode: if the app is encrypted
// here, its sync files are encrypted too. One rule, easy to explain, and
// it means an encrypted user can never be surprised by a plaintext dump
// of their journals appearing on a phone's storage.
async function seal(body) {
  if (!isEncryptionActive()) return { encrypted: false, body };
  const payload = await encryptWithActiveKey(body);
  return { encrypted: true, payload };
}

async function unseal(file) {
  if (!file?.__encrypted) return file?.body ?? null;
  if (!isEncryptionActive()) {
    const err = new Error("This snapshot is encrypted and this device has no passphrase set. Unlock with the same passphrase you used on the other device.");
    err.code = "ENCRYPTED_NO_KEY";
    throw err;
  }
  try {
    return await decryptWithActiveKey(file.__encrypted);
  } catch {
    const err = new Error("Couldn't decrypt that snapshot — the two devices are using different passphrases.");
    err.code = "WRONG_KEY";
    throw err;
  }
}

function header(extra = {}) {
  return {
    __version: SYNC_VERSION,
    device: { id: getDeviceId(), name: getDeviceName(), platform: getBuildTarget() },
    system_id: getActiveSystemId() || null,
    written_at: new Date().toISOString(),
    app_version: APP_VERSION,
    ...extra,
  };
}

// ── Building snapshots ────────────────────────────────────────────────

// getFullDbDump() is a SHALLOW copy — `dump.Alter` is the very object the
// live database is using. Building a snapshot around it means anything
// written between here and the file hitting disk (there is at least one
// await in between, for encryption) leaks into, or vanishes from, the
// snapshot: a torn point-in-time. Deep-copy synchronously, before any
// await, so the file is exactly the state at the instant sync started.
function snapshotCopy(value) {
  try {
    return structuredClone(value);
  } catch {
    // The database is JSON round-trippable by construction — it is
    // persisted as JSON — so this fallback is lossless.
    return JSON.parse(JSON.stringify(value));
  }
}

export async function buildDataSnapshot() {
  return (await buildDataSnapshotWithHash()).snap;
}

// FNV-1a over the plain content — cheap, and computed BEFORE sealing (an
// encrypted body differs on every write, so it can't be compared).
function contentHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${str.length}:${h.toString(16)}`;
}

// The snapshot plus a hash of what it contains, so the runner can skip
// rewriting an identical file (sync audit F13: two open devices used to
// rewrite and re-merge the whole database at each other every 30 s).
export async function buildDataSnapshotWithHash() {
  const dump = snapshotCopy(stripUnsharedSecrets(stripDeviceBound(getFullDbDump())));
  // Look + layout travel apart from the data, and are never applied on
  // their own (see the header). snapshotCopy is a deep copy, so stripping
  // here can't touch the live database. `settings` is deliberately NOT
  // written at the top level any more: builds before 0.243.7 fill gaps
  // from it automatically.
  const systemSettings = stripLookFromDump(dump, pickPrimarySystemSettings);
  let settings = {};
  try { settings = readBackupLocalSettings(); } catch { settings = {}; }
  // HistoryEvent is this device's own undo drawer — merges skip it, so a
  // change there alone is nothing to publish.
  const { HistoryEvent: _history, ...content } = dump;
  const hash = contentHash(JSON.stringify({ data: content, appearance: { settings, systemSettings } }));
  const sealed = await seal({ data: dump, appearance: { settings, systemSettings } });
  return {
    hash,
    snap: {
      __format: SYNC_FORMAT,
      ...header(),
      encrypted: sealed.encrypted,
      ...(sealed.encrypted ? { __encrypted: sealed.payload } : { body: sealed.body }),
    },
  };
}

export async function buildMediaSnapshot() {
  let images = {};
  let fonts = {};
  try { images = await getAllLocalImages(); } catch { images = {}; }
  try { fonts = await getAllLocalFonts(); } catch { fonts = {}; }
  const sealed = await seal({ images, fonts });
  return {
    __format: SYNC_MEDIA_FORMAT,
    ...header({ media_count: Object.keys(images).length + Object.keys(fonts).length }),
    encrypted: sealed.encrypted,
    ...(sealed.encrypted ? { __encrypted: sealed.payload } : { body: sealed.body }),
  };
}

// Cheap fingerprint of the media set, so the cold file is only rewritten
// when it actually changed rather than on every sync.
export async function mediaFingerprint() {
  try {
    const images = await getAllLocalImages();
    const fonts = await getAllLocalFonts();
    const ids = [...Object.keys(images), ...Object.keys(fonts)].sort();
    return `${ids.length}:${ids.join(",").length}:${ids.slice(0, 40).join("|")}`;
  } catch {
    return null;
  }
}

// ── Reading snapshots ─────────────────────────────────────────────────

export function parseSnapshotFile(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("That file isn't readable JSON.");
  }
  if (file?.__format !== SYNC_FORMAT && file?.__format !== SYNC_MEDIA_FORMAT) {
    throw new Error("That file isn't an Oceans Symphony sync snapshot.");
  }
  if ((file.__version || 0) > SYNC_VERSION) {
    throw new Error(`That snapshot was written by a newer version of the app (format ${file.__version}). Update this device first.`);
  }
  return file;
}

// What the OTHER device deleted that we still have. Reported, never
// applied — sync does not delete.
export function summariseIncomingDeletions(incomingDump, localDump) {
  const out = [];
  const tombstones = incomingDump?.DeletionLog || {};
  for (const [key, t] of Object.entries(tombstones)) {
    if (!t || typeof t !== "object") continue;
    const entity = t.entity || String(key).split(":")[0];
    const id = t.record_id || String(key).split(":").slice(1).join(":");
    if (!entity || !id) continue;
    const local = localDump?.[entity]?.[id];
    if (!local) continue; // we don't have it either — nothing to review
    out.push({
      entity,
      id,
      deleted_at: t.deleted_at || null,
      label: local.name || local.title || local.activity_name || local.note || local.content || id,
    });
  }
  return out.sort((a, b) => String(b.deleted_at || "").localeCompare(String(a.deleted_at || "")));
}


// Apply portable preferences from a snapshot.
//
// overwrite:false (what sync does automatically) fills gaps only — the
// same rule localSettingsMirror uses on boot, so syncing can never reach
// over and restyle a device you are using. Preferences carry no
// timestamps, so there is no way to tell "newer"; applying them
// unconditionally would just mean last-device-to-sync wins.
//
// overwrite:true is for the deliberate "make this device look like that
// one" action. Safe precisely because a human asked for it.
//
// Saved presets are never overwritten in either mode — they are merged, so
// copying a look can't wipe the presets this device already has.
export function applyPortableSettings(settings, { overwrite = false, fromName } = {}) {
  if (!settings || typeof settings !== "object") return 0;
  let n = mergePeerPresets(settings, fromName).length ? 1 : 0;
  for (const [key, value] of Object.entries(settings)) {
    if (value == null || key === PRESETS_KEY) continue;
    try {
      if (!overwrite && localStorage.getItem(key) !== null) continue; // ours wins
      localStorage.setItem(key, String(value));
      n += 1;
    } catch { /* storage off — preferences just don't travel */ }
  }
  // The running theme re-reads now; otherwise its next save writes its
  // stale copy back over what was just applied.
  if (n) { try { window.dispatchEvent(new Event("symphony-theme-storage-change")); } catch { /* no window */ } }
  return n;
}

// The preferences inside a snapshot, without merging any of its data.
// Current snapshots keep them under `appearance`; older ones at the top.
export async function readSnapshotSettings(file) {
  const body = await unseal(file);
  const s = body?.appearance?.settings ?? body?.settings;
  return s && typeof s === "object" ? s : null;
}

// The look/layout fields inside a snapshot. Older snapshots carry them
// inside the SystemSettings record itself.
export async function readSnapshotLook(file) {
  const body = await unseal(file);
  const look = body?.appearance?.systemSettings;
  if (look && typeof look === "object") return look;
  const rows = Object.values(body?.data?.SystemSettings || {}).filter((r) => r && typeof r === "object");
  return pickLookFields(pickPrimarySystemSettings(rows));
}

// Apply one device's data snapshot. Additive by design.
export async function applyDataSnapshot(file) {
  const body = await unseal(file);
  const incoming = body?.data;
  if (!incoming || typeof incoming !== "object") {
    throw new Error("That snapshot has no data in it.");
  }
  const localBefore = getFullDbDump();
  const pendingDeletions = summariseIncomingDeletions(incoming, localBefore);
  // Never take another device's look or layout on a sync. Older peers still
  // send the look fields inside the SystemSettings record; drop them before
  // the newer-wins merge can apply them. (incoming is freshly parsed from
  // the file, so mutating it is safe.)
  stripLookFromDump(incoming);
  // applyDeletions stays FALSE. Always. See the header.
  const { conflicts } = await mergeDbDump(incoming, { applyDeletions: false });
  // Saved appearance presets are the one piece of the look that always
  // travels — merged, never replacing (see the header).
  const presetsAdded = mergePeerPresets(body?.appearance?.settings ?? body?.settings, file.device?.name);

  return {
    device: file.device || null,
    written_at: file.written_at || null,
    conflicts: conflicts || [],
    pendingDeletions,
    // Preferences are no longer filled in automatically (see the header).
    settingsFilled: 0,
    presetsAdded,
  };
}

export async function applyMediaSnapshot(file) {
  const body = await unseal(file);
  let images = 0;
  let fonts = 0;
  if (body?.images && Object.keys(body.images).length) {
    try {
      const r = await restoreLocalImages(body.images);
      images = typeof r === "number" ? r : (r?.restored ?? Object.keys(body.images).length);
    } catch { /* media is best-effort — never fail a data sync over an avatar */ }
  }
  if (body?.fonts && Object.keys(body.fonts).length) {
    try {
      const r = await restoreLocalFonts(body.fonts);
      fonts = typeof r === "number" ? r : (r?.restored ?? Object.keys(body.fonts).length);
    } catch { /* ditto */ }
  }
  return { images, fonts };
}
