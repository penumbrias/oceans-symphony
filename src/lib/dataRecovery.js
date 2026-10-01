// Boot-time orphaned-data recovery.
//
// WHY THIS EXISTS: the app stores its whole database as one blob per system,
// keyed in IndexedDB by `symphony_local_data` (System 1 / legacy) or
// `symphony_local_data__<id>` (additional systems). On boot, systems.js points
// localDb at the ACTIVE system's key and App.jsx peeks THAT key. If the active
// pointer ever resolves to an EMPTY slot while the real data sits under another
// key in the same IndexedDB scope, the boot path used to fall straight through
// to the first-run Welcome screen — making a user with hundreds of alters look
// wiped, even though every byte was still on the device.
//
// This module scans EVERY blob key in the current IndexedDB scope for real
// data and reports what it finds, so App.jsx can offer recovery instead of the
// empty setup screen. It NEVER writes, moves, or deletes a data blob — it only
// reads. The one mutating action (adopting a found blob as the active system)
// lives in systems.js and edits only the small registry pointer.
//
// This runs in the boot branches where the active system has nothing to show:
// the slot is missing entirely (`!peek.exists`), or it holds a blob that is
// present but EMPTY (see isEffectivelyEmpty — the hole a "my whole system got
// wiped" user falls through). It can never divert a user whose data is loading
// normally, and it returns an empty list for a genuinely-new user (no blob
// keys) as well as for a user whose only other blobs are REGISTERED sibling
// systems, leaving firstrun and multi-system intact.

import { openDB } from 'idb';
import { getActiveStorageKey } from './localDb';
import { LEGACY_STORAGE_KEY, listSystems, storageKeyForSystem, adoptStorageKeyAsActive } from './systems';
import { listAllDbMirrorCopies, mirrorDbBlob } from './nativeMirror';
import { pickPrimarySystemSettings } from './systemSettingsSingleton';

const IDB_NAME = 'oceans_symphony';
const IDB_STORE = 'keyval';

// Keys that are NOT data blobs even though they live in the same store — the
// systems registry, the shared friend identity, etc. A data blob key is always
// exactly the legacy key or `<legacy>__<systemId>`.
function isDataBlobKey(key) {
  if (typeof key !== 'string') return false;
  return key === LEGACY_STORAGE_KEY || key.startsWith(`${LEGACY_STORAGE_KEY}__`);
}

function systemIdFromKey(key) {
  if (key === LEGACY_STORAGE_KEY) return null; // System 1 / legacy slot
  return key.slice(`${LEGACY_STORAGE_KEY}__`.length) || null;
}

let _idbPromise = null;
function getIdb() {
  if (!_idbPromise) {
    const opening = openDB(IDB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      },
    });
    _idbPromise = opening;
    opening.catch(() => { if (_idbPromise === opening) _idbPromise = null; });
  }
  return _idbPromise;
}

// Count entity records + pull a display name out of a decrypted blob object.
function summarizePlainData(data) {
  let entityCount = 0;
  let alterCount = 0;
  if (data && typeof data === 'object') {
    for (const [name, table] of Object.entries(data)) {
      if (!table || typeof table !== 'object') continue;
      const n = Object.keys(table).length;
      entityCount += n;
      if (name === 'Alter') alterCount = n;
    }
  }
  let name = null;
  try {
    const ss = data && data.SystemSettings;
    if (ss && typeof ss === 'object') {
      const primary = pickPrimarySystemSettings(Object.values(ss)) || {};
      const nm = typeof primary.system_name === 'string' ? primary.system_name.trim() : '';
      if (nm) name = nm;
    }
  } catch { /* name is best-effort */ }
  return { entityCount, alterCount, name };
}

// ── Shared blob enumeration (IndexedDB + localStorage) ──
//
// The data blob normally lives in IndexedDB, but it can also end up in
// localStorage: saveToStorage falls back to localStorage when an IDB write
// throws (localDb.js), and a pre-migration blob lingers there until it's read.
// The original scan only looked at IndexedDB, so a blob stranded in localStorage
// under a NON-active key was invisible — the user was told "no other copies"
// while their data sat right there. These helpers read BOTH stores so recovery
// sees everything. All read-only; none ever throw.

// localStorage data-blob keys → raw string. Never throws.
function readLocalStorageBlobs() {
  const out = new Map();
  try {
    if (typeof localStorage === 'undefined') return out;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!isDataBlobKey(key)) continue;
      let raw;
      try { raw = localStorage.getItem(key); } catch { continue; }
      if (raw == null || raw === '') continue;
      out.set(key, raw);
    }
  } catch { /* localStorage unavailable — the IDB pass still ran */ }
  return out;
}

// Every data-blob key across both stores. IndexedDB first (authoritative — it's
// what loadFromStorage reads), then any localStorage-ONLY keys. Returns
// [{ key, raw, source }] with source 'idb' | 'localStorage'. `skipKey(key)`
// excludes a key before its (possibly large) blob is read.
async function readAllBlobs(skipKey = () => false) {
  const seen = new Set();
  const blobs = [];
  try {
    const idb = await getIdb();
    const keys = await idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAllKeys();
    for (const key of keys) {
      if (!isDataBlobKey(key)) continue;
      if (skipKey(key)) continue;
      let raw;
      try { raw = await idb.get(IDB_STORE, key); } catch { continue; }
      if (raw == null) continue;
      seen.add(key);
      blobs.push({ key, raw, source: 'idb' });
    }
  } catch { /* IDB unreadable — still surface any localStorage copies below */ }
  for (const [key, raw] of readLocalStorageBlobs()) {
    if (seen.has(key)) continue; // an IDB copy under the same key wins
    if (skipKey(key)) continue;
    blobs.push({ key, raw, source: 'localStorage' });
  }
  return blobs;
}

// Turn one raw blob into a candidate record, or null to skip it. `skipEmpty`
// drops parseable-but-empty blobs and skips unparseable ones (orphan scan);
// with skipEmpty=false an unparseable blob is surfaced as `corrupted` (full
// enumeration). The `source` and `isActive` fields are additive — existing
// consumers ignore them.
function classifyBlob({ key, raw, source }, { skipEmpty, isActive = false }) {
  const rawStr = typeof raw === 'string' ? raw : (() => { try { return JSON.stringify(raw); } catch { return ''; } })();
  if (!rawStr) return null;
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch {
    if (skipEmpty) return null; // unparseable — not a clean orphan candidate
    return { key, systemId: systemIdFromKey(key), source, isActive, encrypted: false, corrupted: true, entityCount: null, alterCount: null, sizeBytes: rawStr.length, name: null, raw: rawStr };
  }
  if (parsed && typeof parsed === 'object' && parsed.__encrypted) {
    return { key, systemId: systemIdFromKey(key), source, isActive, encrypted: true, entityCount: null, alterCount: null, sizeBytes: rawStr.length, name: null, raw: rawStr };
  }
  const { entityCount, alterCount, name } = summarizePlainData(parsed);
  if (skipEmpty && entityCount <= 0) return null; // empty object — nothing to recover
  return { key, systemId: systemIdFromKey(key), source, isActive, encrypted: false, entityCount, alterCount, sizeBytes: rawStr.length, name, raw: rawStr };
}

// Copies held in the installed app's private files (nativeMirror.js). A copy
// identical to the live blob under the same key adds nothing and is
// skipped; everything else — a current copy whose web view blob is gone or
// empty, and every "kept" copy — is offered. Candidates carry a unique
// `key` for the list plus the real `storageKey`; adoptCandidate() writes
// them into a NEW slot, never over an existing one. Native only.
// `getLive` is called only when copies exist (always none off native), so
// the web build never pays for reading every live blob. `skipKey` drops
// copies the caller already accounts for.
async function readAppFileCandidates(getLive, opts, skipKey = () => false) {
  let copies = [];
  try { copies = await listAllDbMirrorCopies(); } catch { copies = []; }
  copies = copies.filter((c) => !skipKey(c.key));
  if (copies.length === 0) return [];
  const liveByKey = await getLive();
  const out = [];
  for (const c of copies) {
    if (c.kind === 'current' && liveByKey.get(c.key) === c.raw) continue;
    const rec = classifyBlob({ key: c.key, raw: c.raw, source: 'appFiles' }, opts);
    if (!rec) continue;
    out.push({ ...rec, key: `appfiles:${c.kind}:${c.at || ''}:${c.key}`, storageKey: c.key, copyKind: c.kind, savedAt: c.at });
  }
  return out;
}

// Restore a candidate from any source. Web view blobs are adopted in place
// (registry pointer only); app-file copies are first written into a brand
// new slot, so restoring can never overwrite anything.
export async function adoptCandidate(candidate) {
  if (candidate?.source !== 'appFiles') {
    return adoptStorageKeyAsActive(candidate.key, candidate.name);
  }
  const idb = await getIdb();
  let key;
  do { key = `${LEGACY_STORAGE_KEY}__restored${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
  while ((await idb.get(IDB_STORE, key)) !== undefined);
  await idb.put(IDB_STORE, candidate.raw, key);
  mirrorDbBlob(key, candidate.raw);
  return adoptStorageKeyAsActive(key, candidate.name || 'Restored data');
}

// Scan BOTH stores for data blobs that are NOT the (empty) active slot. Returns
// candidates sorted richest-first:
//   { key, systemId, source, encrypted, entityCount, alterCount, sizeBytes, name, raw }
// - `encrypted` candidates can't be counted without the password, so their
//   entityCount/alterCount are null; they're still offered (a locked blob is
//   still the user's data).
// - `raw` is the on-disk string, handed back so the recovery screen can offer a
//   "download a copy first" button without a second read.
// Never throws for a per-key parse failure — a corrupted key is simply skipped.
// Is a decrypted blob effectively EMPTY — nothing the user would call their
// data? A freshly-initialised DB is not `null`: it's an object of empty
// tables (and often a lone SystemSettings row the app writes on boot), so
// `peek.exists` is true and the boot path's `!peek.exists` recovery branch
// never fires. That is the exact hole a wiped user falls through: the app
// opens on an empty-but-present system, calls itself fine, and their real
// blob sits untouched under another key with no offer to go get it.
//
// SystemSettings is discounted deliberately — it's app-written boot furniture,
// not something the user made.
export function isEffectivelyEmpty(data) {
  if (!data || typeof data !== 'object') return true;
  for (const [name, table] of Object.entries(data)) {
    if (name === 'SystemSettings') continue;
    if (!table || typeof table !== 'object') continue;
    if (Object.keys(table).length > 0) return false;
  }
  return true;
}

export async function scanForOrphanedData() {
  const activeKey = getActiveStorageKey();
  // Blobs belonging to REGISTERED systems are siblings, not orphans — the
  // multi-system registry accounts for them. Without this, creating a second
  // system (fresh empty active slot) made the boot scan flag the FIRST
  // system's data as endangered and blocked setup ("Other data was found…").
  // When the registry itself is missing/wiped (Android cleaners — the real
  // disaster this scanner exists for), listSystems() is empty and every blob
  // stays a candidate, so the recovery net is unchanged.
  const registeredKeys = new Set(listSystems().map((s) => storageKeyForSystem(s)));
  // The active slot is the empty one that sent us here; registered keys are
  // sibling systems' data.
  const blobs = await readAllBlobs((key) => key === activeKey || registeredKeys.has(key));
  const candidates = rankCandidates(blobs);
  // Installed app: copies kept in the app's private files (nativeMirror).
  // Only here — the empty-slot scan — never in the every-launch
  // unregistered scan: those copies can't be "added back to the list" (they
  // aren't in IndexedDB) and kept copies would be re-offered every launch.
  // Copies of OTHER registered systems are skipped: their data is live, and
  // offering them would block setup of a fresh second system.
  const files = await readAppFileCandidates(
    liveBlobsByKey,
    { skipEmpty: true },
    (key) => registeredKeys.has(key) && key !== activeKey,
  );
  return sortByRichness([...candidates, ...files]);
}

async function liveBlobsByKey() {
  const all = await readAllBlobs();
  return new Map(all.map((b) => [b.key, typeof b.raw === 'string' ? b.raw : null]));
}

// Richest first: real record counts beat encrypted-unknown, then by size.
function rankCandidates(blobs) {
  const candidates = [];
  for (const b of blobs) {
    const c = classifyBlob(b, { skipEmpty: true });
    if (c) candidates.push(c);
  }
  return sortByRichness(candidates);
}

function sortByRichness(candidates) {
  return candidates.sort((a, b) => {
    const ae = a.entityCount ?? -1;
    const be = b.entityCount ?? -1;
    if (be !== ae) return be - ae;
    return b.sizeBytes - a.sizeBytes;
  });
}

// Data blobs the registry does NOT list, found while the active system is
// loading normally. scanForOrphanedData only runs when the active slot is
// empty, so a registry that was re-created with just "System 1" (both copies
// lost to a storage cleaner) used to leave every other system's blob on disk
// but off the list forever. The boot path calls this on every launch to offer
// them back. Cheap in the common case: keys are listed first and a blob is
// only read when its key isn't registered, so a healthy registry reads
// nothing. Empty blobs are skipped; encrypted ones are still offered.
// `<key>__rescue` stashes (localDb's concurrent-write backstop) are NOT
// systems — they're older copies of a registered system, listed in Settings →
// Data Rescue — so they're excluded here rather than re-offered every launch.
// Only meaningful after initSystemsRegistry has populated the registry cache:
// with no registry every blob would count, so it returns [] instead.
export async function scanForUnregisteredData() {
  const systems = listSystems();
  if (systems.length === 0) return [];
  const registeredKeys = new Set(systems.map((s) => storageKeyForSystem(s)));
  const blobs = await readAllBlobs((key) => registeredKeys.has(key) || key.endsWith('__rescue'));
  return rankCandidates(blobs);
}

// "Don't ask again" for unregistered blobs the user has decided aren't
// systems they want listed (e.g. a leftover from a delete whose blob removal
// failed). Stored per key WITH its size, so a blob that changes is offered
// again. Device-local on purpose (it describes this device's storage) and
// deliberately not mirrored: if it's wiped, the worst case is being asked
// again — the safe direction.
const DISMISSED_KEY = 'symphony_unregistered_blobs_dismissed_v1';

function readDismissed() {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

export function withoutDismissedUnregistered(candidates) {
  const dismissed = readDismissed();
  return candidates.filter((c) => dismissed[c.key] !== c.sizeBytes);
}

export function dismissUnregistered(candidates) {
  const dismissed = readDismissed();
  for (const c of candidates) dismissed[c.key] = c.sizeBytes;
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed)); } catch { /* ask again next time */ }
}

// Like scanForOrphanedData, but returns EVERY data blob in the scope — including
// the currently-active one (marked `isActive`) — so a manual rescue UI can show
// the user the full picture even when the app booted into a real (or empty)
// system and the boot-time scanner never ran (the `peek.exists === true` gap:
// e.g. a user who tapped "Get Started" over the wipe and now has an empty active
// system). This is the ground-truth enumerator: what data actually exists in
// this app's storage, under which key. Read-only. Never throws per-key.
export async function listAllStorageBlobs() {
  const activeKey = getActiveStorageKey();
  const blobs = await readAllBlobs();
  const out = [];
  for (const b of blobs) {
    const rec = classifyBlob(b, { skipEmpty: false, isActive: b.key === activeKey });
    if (rec) out.push(rec);
  }
  const liveByKey = new Map(blobs.map((b) => [b.key, typeof b.raw === 'string' ? b.raw : null]));
  out.push(...await readAppFileCandidates(() => liveByKey, { skipEmpty: true }));
  // Active first, then richest — so the user sees "the one you're in" up top,
  // then any other copies ranked by how much data they hold.
  out.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (b.entityCount ?? -1) - (a.entityCount ?? -1);
  });
  return out;
}
