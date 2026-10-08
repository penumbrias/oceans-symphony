// Runs one sync pass: write our snapshot, read everyone else's, merge.
//
// Split from deviceSync.js (which owns the format) and syncAdapters.js
// (which owns the platform) so this file is only the sequence — and so a
// future transport can reuse the other two untouched.
//
// Order matters: WRITE FIRST, then read. If a cable is pulled halfway
// through, the worst outcome is that our snapshot is on the other device
// and we didn't get theirs — recoverable by syncing again. Reading first
// and crashing before the write leaves the other device with nothing.

import { getFullDbDump, getLocalRevision } from "@/lib/localDb";
import { PRESETS_KEY } from "@/lib/presetSync";
import {
  buildDataSnapshotWithHash, buildMediaSnapshot, mediaFingerprint,
  parseSnapshotFile, applyDataSnapshot, applyMediaSnapshot,
  readSnapshotSettings, readSnapshotLook, applyPortableSettings,
  parseSyncFileName, dataFileName, mediaFileName,
  getDeviceId, SYNC_FORMAT, SYNC_MEDIA_FORMAT,
} from "@/lib/deviceSync";
import { getSyncAdapter } from "@/lib/syncAdapters";
import { getActiveSystemId } from "@/lib/systems";
import { localEntities } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { unifyHomeBoards, RETIRED_DESKTOP_FIELD } from "@/lib/homeBoardUnify";

const FOLDER_KEY = "symphony_sync_folder";
const LAST_RUN_KEY = "symphony_sync_last_run";
const MEDIA_FP_KEY = "symphony_sync_media_fp";
const AUTO_KEY = "symphony_sync_auto";
// Per-device-file positions we've already merged, so a folder that hasn't
// changed costs one directory listing instead of a full merge.
const SEEN_KEY = "symphony_sync_seen";
// Deletions another device made that we still have. Held here rather than
// in component state because a pass only merges a peer file ONCE (the
// seen-marks skip unchanged files), so a review list that lived in the UI
// would vanish the moment the panel closed and never come back.
const PENDING_DEL_KEY = "symphony_sync_pending_deletions";
// Peer SYSTEMS this device has agreed to sync with.
//
// Two devices set up independently always have different system ids —
// the id is minted per install, not per person. So scoping sync to
// "same system id" (the first cut) meant a phone and a desktop could
// never sync, which is the entire use case.
//
// But silently merging ANY system found in the folder is wrong too: a
// multi-system user pointing two systems at one folder would have them
// blended irreversibly. So the folder is the pairing, confirmed once:
// an unrecognised system is reported, not merged, until the user says
// yes. Keyed by local system so pairing one system doesn't pair another.
const PAIRED_KEY = "symphony_sync_paired_systems";
// Hash of the content we last wrote, per data file. Device-bound (never in
// BACKUP_LS_KEYS): it describes THIS device's file in the folder.
const WRITTEN_HASH_KEY = "symphony_sync_written_hash";
// Revision of the local database at the end of the last pass (in memory:
// a fresh app start always runs one pass).
let _revisionAtLastPass = null;

// Has this device changed anything since the last sync pass? Merges done
// BY that pass don't count — they're already in the folder.
// Saved presets live in localStorage, outside the database revision, so a
// preset saved on its own is checked separately.
let _presetsAtLastPass = null;
const presetsNow = () => readLs(PRESETS_KEY, "");
export function hasLocalChangesSinceSync() {
  return _revisionAtLastPass === null || getLocalRevision() !== _revisionAtLastPass
    || presetsNow() !== _presetsAtLastPass;
}

// All of these are DEVICE-BOUND on purpose and must never be added to
// BACKUP_LS_KEYS: the folder path is meaningless on another machine, and
// the "seen" marks describe what THIS device has merged.
export const SYNC_LOCAL_KEYS = [FOLDER_KEY, LAST_RUN_KEY, MEDIA_FP_KEY, AUTO_KEY, SEEN_KEY, PENDING_DEL_KEY, PAIRED_KEY];

const readLs = (k, fallback = null) => {
  try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch { return fallback; }
};
const writeLs = (k, v) => {
  try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch { /* non-fatal */ }
};
const readJson = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k) || "") ?? fallback; } catch { return fallback; }
};

export const getSyncFolder = () => readLs(FOLDER_KEY, "") || "";
export function setSyncFolder(p) {
  const next = p || null;
  const prev = getSyncFolder();
  writeLs(FOLDER_KEY, next);
  // A different folder is a different conversation. The media fingerprint
  // ("we already wrote the avatars") and the seen-marks ("we already
  // merged that peer file") both describe the OLD folder — carried over,
  // they make us skip work the new folder genuinely needs. The visible
  // symptom was a new folder never receiving a media snapshot at all, so
  // the other device got records but no avatars.
  if ((prev || "") !== (next || "")) {
    writeLs(MEDIA_FP_KEY, null);
    writeLs(SEEN_KEY, null);
  }
}
export const getLastRun = () => readLs(LAST_RUN_KEY, "") || "";
export const isAutoSyncOn = () => readLs(AUTO_KEY, "1") === "1";
export const setAutoSync = (on) => writeLs(AUTO_KEY, on ? "1" : "0");

export async function pickSyncFolder() {
  const adapter = getSyncAdapter();
  const picked = await adapter.pickFolder();
  if (picked) setSyncFolder(picked);
  return picked;
}

const slugSystem = (v) => String(v || "default").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);

export function getPairedSystems() {
  const all = readJson(PAIRED_KEY, {});
  const key = slugSystem(getActiveSystemId());
  const list = all && typeof all === "object" ? all[key] : null;
  return Array.isArray(list) ? list : [];
}

export function pairSystem(peerSystemId) {
  if (!peerSystemId) return;
  const all = readJson(PAIRED_KEY, {}) || {};
  const key = slugSystem(getActiveSystemId());
  const list = Array.isArray(all[key]) ? all[key] : [];
  if (!list.includes(peerSystemId)) list.push(peerSystemId);
  all[key] = list;
  writeLs(PAIRED_KEY, JSON.stringify(all));
}

export function unpairSystem(peerSystemId) {
  const all = readJson(PAIRED_KEY, {}) || {};
  const key = slugSystem(getActiveSystemId());
  all[key] = (Array.isArray(all[key]) ? all[key] : []).filter((x) => x !== peerSystemId);
  writeLs(PAIRED_KEY, JSON.stringify(all));
}

// What's in the folder, grouped per device — powers the "devices seen
// here" list without merging anything.
export async function listSyncPeers() {
  const adapter = getSyncAdapter();
  if (!adapter.available) return [];
  const dir = getSyncFolder();
  if (!dir && adapter.canPickFolder) return [];
  const files = await adapter.list(dir);
  const mine = getDeviceId();
  const system = String(getActiveSystemId() || "default");
  const localSystem = slugSystem(system);
  const paired = getPairedSystems();
  // Grouped per device AND system. One device can leave snapshots for two
  // systems in the folder (a multi-system user, or an old system left
  // behind after a reinstall). Keyed by device alone, the second file
  // overwrote the first's data slot while the entry kept the FIRST
  // system's id — so pairing one system could merge the other's data.
  const byDevice = new Map();
  for (const f of files) {
    const parsed = parseSyncFileName(f.name);
    if (!parsed) continue;
    const key = `${parsed.deviceId}:${parsed.systemId}`;
    const entry = byDevice.get(key) || {
      key,
      deviceId: parsed.deviceId,
      isSelf: parsed.deviceId === mine,
      systemId: parsed.systemId,
      // Same system, or one the user has explicitly paired. Anything else
      // is surfaced for a decision rather than merged.
      sameSystem: parsed.systemId === localSystem,
      paired: paired.includes(parsed.systemId),
    };
    entry[parsed.kind] = f;
    byDevice.set(key, entry);
  }
  return [...byDevice.values()];
}

// One full pass. Returns a plain report the UI can render.
export async function runSync({ force = false } = {}) {
  const adapter = getSyncAdapter();
  if (!adapter.available) throw new Error(adapter.reason || "Sync is not available on this device.");
  const dir = getSyncFolder();
  if (!dir && adapter.canPickFolder) throw new Error("Choose a folder to sync through first.");

  const report = {
    startedAt: new Date().toISOString(),
    wrote: [], merged: [], skipped: [], errors: [], needsPairing: [], unreadable: [],
    conflicts: [], pendingDeletions: [], media: { images: 0, fonts: 0 }, settingsFilled: 0, presetsMerged: 0,
  };

  // ── 1. Write ours first (see header) ────────────────────────────────
  // Skipped when the content is identical to the file already in the
  // folder — an unchanged rewrite still changes its mtime, which made the
  // other device re-merge everything, rewrite ITS file, and so on.
  try {
    const { snap, hash } = await buildDataSnapshotWithHash();
    const hashes = readJson(WRITTEN_HASH_KEY, {});
    let ours = null;
    try { ours = (await listSyncPeers()).find((p) => p.isSelf && p.data)?.data || null; } catch { ours = null; }
    if (force || !ours || hashes[dataFileName()] !== hash) {
      await adapter.write(dir, dataFileName(), JSON.stringify(snap));
      hashes[dataFileName()] = hash;
      writeLs(WRITTEN_HASH_KEY, JSON.stringify(hashes));
      report.wrote.push("data");
    }
  } catch (e) {
    // A failed write is fatal for this pass: continuing to read would
    // report "synced" while the other device never receives our changes.
    report.errors.push({ stage: "write", message: e?.message || String(e) });
    return report;
  }

  // Media only when it actually changed — this is the 40MB file.
  try {
    const fp = await mediaFingerprint();
    if (force || (fp && fp !== readLs(MEDIA_FP_KEY, ""))) {
      const mediaSnap = await buildMediaSnapshot();
      await adapter.write(dir, mediaFileName(), JSON.stringify(mediaSnap));
      if (fp) writeLs(MEDIA_FP_KEY, fp);
      report.wrote.push("media");
    }
  } catch (e) {
    // Non-fatal: data sync is the point; avatars can catch up next pass.
    report.errors.push({ stage: "write-media", message: e?.message || String(e) });
  }

  // ── 2. Read the others ──────────────────────────────────────────────
  let peers = [];
  try {
    const all = (await listSyncPeers()).filter((p) => !p.isSelf);
    // An unrecognised system is never merged silently — it is offered.
    report.needsPairing = all
      .filter((p) => !p.sameSystem && !p.paired)
      .map((p) => ({ key: p.key, deviceId: p.deviceId, systemId: p.systemId }));
    peers = all.filter((p) => p.sameSystem || p.paired);
  } catch (e) {
    report.errors.push({ stage: "list", message: e?.message || String(e) });
    return report;
  }

  const seen = readJson(SEEN_KEY, {});
  for (const peer of peers) {
    const f = peer.data;
    if (!f) continue;
    const mark = `${f.size}:${Math.round(f.mtimeMs || 0)}`;
    if (!force && seen[`${peer.key}:data`] === mark) {
      report.skipped.push({ deviceId: peer.deviceId, reason: "unchanged" });
      continue;
    }
    try {
      const file = parseSnapshotFile(await adapter.read(dir, f.name));
      if (file.__format !== SYNC_FORMAT) throw new Error("Not a data snapshot.");
      const res = await applyDataSnapshot(file);
      report.merged.push({
        key: peer.key,
        deviceId: peer.deviceId,
        name: file.device?.name || peer.deviceId,
        writtenAt: res.written_at,
      });
      report.conflicts.push(...res.conflicts);
      report.settingsFilled += res.settingsFilled || 0;
      report.presetsMerged += res.presetsMerged || 0;
      report.pendingDeletions.push(...res.pendingDeletions.map((d) => ({ ...d, fromDevice: file.device?.name || peer.deviceId })));
      seen[`${peer.key}:data`] = mark;
    } catch (e) {
      // A half-written or stale snapshot (a device that was reinstalled
      // leaves its old file behind forever) must not read as "sync is
      // broken". Name the file, keep going, and let the UI offer to
      // remove it — telling someone to go delete a file on a phone over
      // USB is not a fix.
      report.unreadable.push({
        deviceId: peer.deviceId,
        name: f.name,
        reason: e?.message || String(e),
      });
      continue; // a bad file from one device must not stop the others
    }

    // Media is best-effort and only when that device's media changed.
    const mf = peer.media;
    if (!mf) continue;
    const mediaMark = `${mf.size}:${Math.round(mf.mtimeMs || 0)}`;
    if (!force && seen[`${peer.key}:media`] === mediaMark) continue;
    try {
      const file = parseSnapshotFile(await adapter.read(dir, mf.name));
      if (file.__format !== SYNC_MEDIA_FORMAT) throw new Error("Not a media snapshot.");
      const res = await applyMediaSnapshot(file);
      report.media.images += res.images;
      report.media.fonts += res.fonts;
      seen[`${peer.key}:media`] = mediaMark;
    } catch (e) {
      report.unreadable.push({
        deviceId: peer.deviceId,
        name: mf.name,
        reason: e?.message || String(e),
      });
    }
  }

  writeLs(SEEN_KEY, JSON.stringify(seen));
  // Merged changes are already in the folder (they came from it); only
  // edits made after this point need the next pass.
  _revisionAtLastPass = getLocalRevision();
  _presetsAtLastPass = presetsNow();
  // Park anything the other device deleted for review — never applied here.
  if (report.pendingDeletions.length) addPendingDeletions(report.pendingDeletions);
  report.finishedAt = new Date().toISOString();
  writeLs(LAST_RUN_KEY, report.finishedAt);
  return report;
}

// Is there anything new in the folder? A cheap listing, for the poll.
export async function hasIncomingChanges() {
  try {
    // Only devices we'd actually merge. An unpaired file is never marked
    // seen, so counting it made every 30 s tick run a full pass (and
    // rewrite our own snapshot) for as long as it sat in the folder.
    const peers = (await listSyncPeers()).filter((p) => !p.isSelf && (p.sameSystem || p.paired));
    const seen = readJson(SEEN_KEY, {});
    return peers.some((p) => {
      if (!p.data) return false;
      return seen[`${p.key}:data`] !== `${p.data.size}:${Math.round(p.data.mtimeMs || 0)}`;
    });
  } catch {
    return false;
  }
}

// Local record count, so the UI can say what a sync actually changed.
export function localRecordCount() {
  try {
    const dump = getFullDbDump();
    let n = 0;
    for (const [k, v] of Object.entries(dump || {})) {
      if (k.startsWith("__")) continue;
      if (v && typeof v === "object") n += Object.keys(v).length;
    }
    return n;
  } catch {
    return 0;
  }
}

// ── Pending deletion review ───────────────────────────────────────────
//
// Sync never deletes. When another device's snapshot shows it deleted
// something we still hold, that lands here for the user to decide. The
// list is pruned against reality on every read: anything we no longer
// have (deleted here too, in the meantime) simply drops off.

export function getPendingDeletions() {
  const raw = readJson(PENDING_DEL_KEY, []);
  if (!Array.isArray(raw) || !raw.length) return [];
  let dump = {};
  try { dump = getFullDbDump() || {}; } catch { return raw; }
  const live = raw.filter((d) => d && d.entity && d.id && dump?.[d.entity]?.[d.id]);
  if (live.length !== raw.length) writeLs(PENDING_DEL_KEY, JSON.stringify(live));
  return live;
}

export function addPendingDeletions(items) {
  if (!items?.length) return;
  const existing = readJson(PENDING_DEL_KEY, []);
  const byKey = new Map((Array.isArray(existing) ? existing : []).map((d) => [`${d.entity}:${d.id}`, d]));
  for (const it of items) {
    if (!it?.entity || !it?.id) continue;
    byKey.set(`${it.entity}:${it.id}`, it);
  }
  writeLs(PENDING_DEL_KEY, JSON.stringify([...byKey.values()].slice(0, 500)));
}

// Dismiss one from the review list without touching the record — "no,
// I want to keep this here".
export function keepPendingDeletion(entity, id) {
  const existing = readJson(PENDING_DEL_KEY, []);
  const next = (Array.isArray(existing) ? existing : []).filter((d) => !(d.entity === entity && d.id === id));
  writeLs(PENDING_DEL_KEY, JSON.stringify(next));
}

export function clearPendingDeletions() {
  writeLs(PENDING_DEL_KEY, null);
}

// Delete one snapshot file from the sync folder. Used to clear a stale
// file left behind by a reinstalled device, or one that was cut off
// mid-write. Only ever removes a file the folder listing produced, and
// the desktop main process refuses any name that isn't a snapshot.
export async function removeSyncFile(name) {
  const adapter = getSyncAdapter();
  if (!adapter.remove) throw new Error("This device can't remove sync files.");
  await adapter.remove(getSyncFolder(), name);
  // Forget any merge marks for it so a replacement with the same name is
  // read fresh rather than skipped as "already seen".
  const seen = readJson(SEEN_KEY, {});
  for (const k of Object.keys(seen)) if (name.includes(k.split(":")[0])) delete seen[k];
  writeLs(SEEN_KEY, JSON.stringify(seen));
}

// "Make this device look like that one." Sync only ever FILLS missing
// preferences, which is right for a device you're already using but
// leaves no way to deliberately adopt another device's theme. This does
// that, on request.
//
// Returns { applied, from } — or throws with a reason a person can act
// on, the common one being that the other device is on a build old
// enough that its snapshots carry no preferences at all.
// `key` picks one device (listSyncPeers' `${deviceId}:${systemId}`). The
// sync panel always passes it: "newest" is the wrong default when two
// devices share a folder — the one that happens to have written last wins.
// The one board a peer's look should bring: its own single board, or —
// from an older peer that still has two — the one that peer displays.
export function boardYouSee(look, platform) {
  if (!look || typeof look !== "object" || !look[RETIRED_DESKTOP_FIELD]) return look;
  const { [RETIRED_DESKTOP_FIELD]: desk, ...rest } = look;
  if (platform === "desktop" || !rest.ui_v2_home) rest.ui_v2_home = desk;
  return rest;
}

export async function copyAppearanceFrom({ key = null } = {}) {
  const adapter = getSyncAdapter();
  const dir = getSyncFolder();
  // Paired/same-system peers only — never restyle this device from a
  // system the user hasn't agreed to sync with.
  const peers = (await listSyncPeers())
    .filter((p) => !p.isSelf && p.data && (p.sameSystem || p.paired))
    .filter((p) => !key || p.key === key)
    .sort((a, b) => (b.data.mtimeMs || 0) - (a.data.mtimeMs || 0));
  if (!peers.length) throw new Error("No paired device's snapshot in that folder yet.");

  for (const peer of peers) {
    let settings = null;
    let look = null;
    let name = peer.deviceId;
    let platform = null;
    try {
      const file = parseSnapshotFile(await adapter.read(dir, peer.data.name));
      name = file.device?.name || name;
      platform = file.device?.platform || null;
      settings = await readSnapshotSettings(file);
      look = await readSnapshotLook(file);
    } catch {
      continue; // unreadable snapshots are reported by the sync pass
    }
    // "Use its appearance" means the board you SEE on that device. A
    // device older than one-board-per-device (v0.248.0) still keeps a
    // separate desktop board, which is the one its desktop app shows.
    look = boardYouSee(look, platform);
    const hasSettings = settings && Object.keys(settings).length > 0;
    const hasLook = look && Object.keys(look).length > 0;
    if (!hasSettings && !hasLook) continue;
    // The ONE place another device's look and layout are applied — because
    // a person asked for it. The layout fields go through the normal
    // entity update, so the previous layout lands in Recent changes and
    // can be put back.
    let layoutFields = 0;
    if (hasLook) {
      // Fold this device's own two boards first (keeping the spare as a
      // preset), so the copied board can't lose to a stale local one.
      await unifyHomeBoards();
      const rows = await localEntities.SystemSettings.list();
      const row = pickPrimarySystemSettings(rows) || rows[0];
      if (row?.id) {
        await localEntities.SystemSettings.update(row.id, look);
        layoutFields = Object.keys(look).length;
        await unifyHomeBoards();
      }
    }
    const applied = hasSettings ? applyPortableSettings(settings, { overwrite: true, fromName: name }) : 0;
    return { applied, layoutFields, from: name };
  }
  throw new Error("The other device's snapshot doesn't include appearance settings — it's running an older version. Update it and sync once, then try again.");
}
