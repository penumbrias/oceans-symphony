// Multiple-systems registry (Phase 0 foundation).
//
// Oceans Symphony stores its ENTIRE database as one blob behind localDb.js
// (IndexedDB key `symphony_local_data`). "Multiple systems" is therefore NOT
// a `system_id` column on every record — it's ONE data blob per system plus a
// small app-level registry that records which systems exist and which one is
// active. Switching systems re-points localDb at that system's blob and
// reloads; the whole existing app then runs unchanged inside the active system.
//
// THE SAFETY GUARANTEE: the first system ("System 1") keeps the LEGACY key
// `symphony_local_data` as its storage slot. So turning multi-system on moves
// ZERO existing data — your current data simply becomes System 1, read from
// exactly where it already lives. New systems get fresh `symphony_local_data__<id>`
// slots. Nothing is ever copied or overwritten by this layer.
//
// The registry itself is stored with the same dual-store resilience as the main
// blob (IndexedDB primary + a localStorage mirror) so an Android storage cleaner
// wiping one store can't lose it. If the registry is ever lost entirely,
// ensureRegistry() idempotently re-creates "System 1 → legacy key", so a
// single-system user is unaffected.
//
// This module imports ONLY `setActiveStorageKey` from localDb (one-way), so
// there is no circular dependency; localDb knows nothing about systems.

import { openDB } from 'idb';
import { setActiveStorageKey, isEncryptionActive, getActiveSalt, encryptWithActiveKey, decryptWithActiveKey } from './localDb';
import { encryptData, decryptData } from './localEncryption';
import { pickPrimarySystemSettings } from './systemSettingsSingleton';

const IDB_NAME = 'oceans_symphony';
const IDB_STORE = 'keyval';
const REGISTRY_KEY = 'symphony_systems_registry';

// The legacy single-system blob key. System 1 uses this so existing data never
// moves. Must match DEFAULT_STORAGE_KEY in localDb.js.
export const LEGACY_STORAGE_KEY = 'symphony_local_data';
const REGISTRY_VERSION = 1;

// In-memory cache of the active system's storage key, set during init.
let _cachedRegistry = null;

function genId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `sys-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

// The storage slot for a given system id. The first system keeps the legacy key
// (zero data movement); every other system gets a namespaced slot.
export function storageKeyForSystem(system) {
  if (!system) return LEGACY_STORAGE_KEY;
  if (system.storageKey) return system.storageKey;
  return `${LEGACY_STORAGE_KEY}__${system.id}`;
}

let _idbPromise = null;
function getIdb() {
  if (!_idbPromise) {
    _idbPromise = openDB(IDB_NAME, 1, {
      upgrade(db) {
        // Mirror localDb's store creation so whichever module opens the db
        // first sets up the keyval store.
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      },
    });
  }
  return _idbPromise;
}

function readLocalMirror() {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeLocalMirror(reg) {
  try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg)); } catch { /* quota/disabled */ }
}

function isValidRegistry(reg) {
  return !!(reg && typeof reg === 'object' && Array.isArray(reg.systems) && reg.systems.length > 0);
}

// Load the registry from IndexedDB (primary), falling back to the localStorage
// mirror if IDB is empty/unavailable. Returns null when neither store has one.
async function loadRegistry() {
  let fromIdb;
  try {
    const idb = await getIdb();
    fromIdb = await idb.get(IDB_STORE, REGISTRY_KEY);
  } catch { fromIdb = undefined; }
  if (isValidRegistry(fromIdb)) {
    writeLocalMirror(fromIdb); // keep the fast/peekable mirror fresh
    return fromIdb;
  }
  const mirror = readLocalMirror();
  if (isValidRegistry(mirror)) {
    // IDB lost it (e.g. cleared) but the mirror survived — restore IDB.
    try { const idb = await getIdb(); await idb.put(IDB_STORE, mirror, REGISTRY_KEY); } catch { /* best effort */ }
    return mirror;
  }
  return null;
}

// Persist to BOTH stores so neither a localStorage wipe nor an IDB wipe alone
// can lose the registry.
async function saveRegistry(reg) {
  _cachedRegistry = reg;
  writeLocalMirror(reg);
  try {
    const idb = await getIdb();
    await idb.put(IDB_STORE, reg, REGISTRY_KEY);
  } catch { /* mirror still holds it */ }
}

// Create the registry the first time multi-system boots, recording the user's
// existing data as "System 1" pointing at the LEGACY blob key. NON-DESTRUCTIVE:
// it never reads, copies, moves, or writes any data blob — only the registry.
async function ensureRegistry() {
  const existing = await loadRegistry();
  if (isValidRegistry(existing)) {
    _cachedRegistry = existing;
    return existing;
  }
  const id = genId();
  const reg = {
    version: REGISTRY_VERSION,
    activeSystemId: id,
    systems: [
      {
        id,
        // Neutral default; the switcher UI (later phase) resolves the real
        // display name from this system's loaded SystemSettings. Stored here
        // only as a fallback label.
        name: 'System 1',
        avatar: null,
        storageKey: LEGACY_STORAGE_KEY, // <-- existing data stays put
        order: 0,
        createdAt: nowIso(),
      },
    ],
  };
  await saveRegistry(reg);
  return reg;
}

// Boot entry point: ensure a registry exists, resolve the active system, and
// point localDb at its blob — all BEFORE the boot path reads storage. Safe to
// call repeatedly (idempotent). On any failure the caller falls back to the
// legacy key (the default in localDb), so a single-system user always boots.
export async function initSystemsRegistry() {
  const reg = await ensureRegistry();
  const active = reg.systems.find((s) => s.id === reg.activeSystemId) || reg.systems[0];
  setActiveStorageKey(storageKeyForSystem(active));
  _cachedRegistry = reg;
  return reg;
}

// ---- Read helpers (sync, from the cache populated by initSystemsRegistry) ----

export function getCachedRegistry() {
  return _cachedRegistry;
}

export function listSystems() {
  if (!_cachedRegistry) return [];
  return [..._cachedRegistry.systems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getActiveSystemId() {
  return _cachedRegistry ? _cachedRegistry.activeSystemId : null;
}

export function getActiveSystem() {
  if (!_cachedRegistry) return null;
  return _cachedRegistry.systems.find((s) => s.id === _cachedRegistry.activeSystemId) || null;
}

export function hasMultipleSystems() {
  return !!(_cachedRegistry && _cachedRegistry.systems.length > 1);
}

// Read a system's REAL display name straight from its data blob (its
// SystemSettings.system_name) WITHOUT switching to it — so the switcher shows
// each system's actual name, not just the registry's "System N" default.
// Returns null when the blob is missing, unparseable, has no name set, or is
// encrypted (we can't read it without the in-memory key; such systems keep
// their last-known registry name).
// Read a system's name + avatar (system picture) from its own blob's
// SystemSettings, without switching to it. Returns { name, avatar, readable }.
// `readable` is false for missing/encrypted/unparseable blobs — callers use it
// to avoid clobbering a last-known name/avatar for a system they can't read.
export async function readSystemMeta(system) {
  const empty = { name: null, avatar: null, readable: false };
  if (!system) return empty;
  try {
    const idb = await getIdb();
    const raw = await idb.get(IDB_STORE, storageKeyForSystem(system));
    if (!raw) return empty;
    let parsed;
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return empty; }
    if (!parsed || typeof parsed !== 'object' || parsed.__encrypted) return empty;
    const ss = parsed.SystemSettings;
    if (!ss || typeof ss !== 'object') return { name: null, avatar: null, readable: true };
    const rows = Object.values(ss);
    // Read the name AND avatar from the SAME primary record the Profile screen
    // uses (pickPrimarySystemSettings) — otherwise a duplicate empty stub can
    // leave the switcher showing a different avatar/name than the profile. The
    // profile saves its picture in `system_avatar_url` (with a `system_avatar`
    // legacy fallback a few imports used).
    const primary = pickPrimarySystemSettings(rows) || {};
    const nm = typeof primary.system_name === 'string' ? primary.system_name.trim() : '';
    const avSrc = primary.system_avatar_url || primary.system_avatar || '';
    const av = typeof avSrc === 'string' ? avSrc.trim() : '';
    return {
      name: nm || null,
      avatar: av || null,
      readable: true,
    };
  } catch { return empty; }
}

// Back-compat name-only reader.
export async function readSystemDisplayName(system) {
  return (await readSystemMeta(system)).name;
}

// Sync every registry entry's display name + avatar from its blob's
// SystemSettings, persist any change, and return the up-to-date sorted list.
// Lets the switcher show real names/pictures that self-heal as a system is
// edited in its Profile. Only readable (plain) blobs update the cache;
// encrypted/missing blobs keep their last-known name + avatar.
export async function refreshSystemNames() {
  const reg = await ensureRegistry();
  let changed = false;
  for (const s of reg.systems) {
    const meta = await readSystemMeta(s);
    if (!meta.readable) continue;
    if (meta.name && meta.name !== s.name) { s.name = meta.name; changed = true; }
    const nextAvatar = meta.avatar || null;
    if ((s.avatar || null) !== nextAvatar) { s.avatar = nextAvatar; changed = true; }
  }
  if (changed) await saveRegistry(reg);
  return [...reg.systems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ---- Registry mutations (foundation primitives; UI wiring comes in P1/P2) ----
// These only edit the registry. Switching ACTIVE systems requires an app
// reload (so localDb re-points cleanly) — the switcher UI will reload after
// calling setActiveSystem. None of these move or delete data blobs (delete is
// deferred to a later phase with a forced backup first).

// Append a new, empty system. Allocates a fresh storage slot but does NOT
// create the blob — it is written when the user first sets up / saves into that
// system. Returns the new system record.
export async function createSystem({ name } = {}) {
  const reg = (await ensureRegistry());
  const id = genId();
  const maxOrder = reg.systems.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
  const system = {
    id,
    name: name && name.trim() ? name.trim() : `System ${reg.systems.length + 1}`,
    avatar: null,
    storageKey: `${LEGACY_STORAGE_KEY}__${id}`,
    order: maxOrder + 1,
    createdAt: nowIso(),
  };
  reg.systems.push(system);
  await saveRegistry(reg);
  return system;
}

export async function setActiveSystem(id) {
  const reg = await ensureRegistry();
  if (!reg.systems.some((s) => s.id === id)) return reg;
  reg.activeSystemId = id;
  await saveRegistry(reg);
  return reg;
}

// Boot-recovery primitive (see dataRecovery.js): make the given storage key the
// ACTIVE system, so the next boot loads the blob living at that key. Used when
// the scanner finds real data under a key the active pointer wasn't aimed at
// (a mis-pointed / drifted registry). NON-DESTRUCTIVE: only edits the registry
// pointer — never reads, moves, or deletes a data blob.
//
// Resolution order:
//   1. An existing system already maps to this key → just activate it.
//   2. key is the legacy slot but no system maps to it (drifted registry) →
//      re-point the lowest-order system at the legacy key and activate it, so
//      we heal in place instead of spawning a duplicate System 1.
//   3. Otherwise → append a new system entry pointing at the key and activate.
// Returns the now-active system record.
export async function adoptStorageKeyAsActive(key, fallbackName) {
  const reg = await ensureRegistry();

  const existing = reg.systems.find((s) => storageKeyForSystem(s) === key);
  if (existing) {
    reg.activeSystemId = existing.id;
    await saveRegistry(reg);
    return existing;
  }

  if (key === LEGACY_STORAGE_KEY && reg.systems.length > 0) {
    const first = [...reg.systems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
    first.storageKey = LEGACY_STORAGE_KEY;
    reg.activeSystemId = first.id;
    await saveRegistry(reg);
    return first;
  }

  const id = genId();
  const maxOrder = reg.systems.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
  const system = {
    id,
    name: (fallbackName && fallbackName.trim()) || `Recovered System`,
    avatar: null,
    storageKey: key, // explicit — points straight at the found blob
    order: maxOrder + 1,
    createdAt: nowIso(),
  };
  reg.systems.push(system);
  reg.activeSystemId = id;
  await saveRegistry(reg);
  return system;
}

export async function renameSystem(id, name) {
  const reg = await ensureRegistry();
  const sys = reg.systems.find((s) => s.id === id);
  if (!sys) return reg;
  sys.name = (name || '').trim() || sys.name;
  await saveRegistry(reg);
  return reg;
}

// Raw on-disk blob (string) for a system — used to save a backup before
// deleting it. Returns null if the system has no blob yet.
export async function getSystemRawBlob(system) {
  if (!system) return null;
  try {
    const idb = await getIdb();
    const raw = await idb.get(IDB_STORE, storageKeyForSystem(system));
    if (raw == null) return null;
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch { return null; }
}

// A system's full DECRYPTED entity dump ({ EntityName: { id: record } }), read
// from its own blob without switching to it. Used by multi-system export.
// Returns null if missing/unparseable, or if encrypted and the app is locked.
export async function getSystemData(system) {
  const raw = await getSystemRawBlob(system);
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (parsed && typeof parsed === 'object' && parsed.__encrypted) {
    try { return await decryptWithActiveKey(parsed.__encrypted); } catch { return null; }
  }
  return parsed;
}

// Append/merge entities into an EXISTING (usually inactive) system's blob,
// without switching to it — used by cross-system transfer (move/copy an alter
// or group from the active system into another). `entitiesByType` is
// { EntityName: [record, ...] }; records are merged by `id` (an existing id is
// overwritten, new ids are added). The target blob is decrypted with the active
// app key when encrypted (one-password-for-all, see P3) and re-written in the
// same shape. Avatars live in the shared global image store, so moved records'
// `avatar_url` keeps resolving in the target with no image copying. Returns the
// number of records written.
//
// SAFETY: callers MUST do this BEFORE removing anything from the source, so a
// failure here leaves the source intact (no data loss). Throws on a missing
// target or an unreadable (e.g. encrypted-but-locked) target blob.
export async function appendEntitiesToSystem(systemId, entitiesByType) {
  const reg = await ensureRegistry();
  const sys = reg.systems.find((s) => s.id === systemId);
  if (!sys) throw new Error('Target system not found');
  const idb = await getIdb();
  const key = storageKeyForSystem(sys);

  let data = {};
  const raw = await idb.get(IDB_STORE, key);
  if (raw != null) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && parsed.__encrypted) {
      // Will throw if the app is locked / key absent — caller surfaces it and
      // leaves the source untouched.
      data = await decryptWithActiveKey(parsed.__encrypted);
    } else {
      data = parsed && typeof parsed === 'object' ? parsed : {};
    }
  }

  let written = 0;
  for (const [type, records] of Object.entries(entitiesByType || {})) {
    if (!Array.isArray(records) || !records.length) continue;
    if (!data[type] || typeof data[type] !== 'object') data[type] = {};
    for (const rec of records) {
      if (rec && rec.id) { data[type][rec.id] = rec; written++; }
    }
  }

  let blob;
  if (isEncryptionActive()) {
    blob = JSON.stringify({ __encrypted: await encryptWithActiveKey(data), __salt: getActiveSalt(), __format_version: 2 });
  } else {
    blob = JSON.stringify(data);
  }
  await idb.put(IDB_STORE, blob, key);
  return written;
}

// Create a NEW system and write the given entity dump as its blob — used by
// multi-system RESTORE. If encryption is active, the blob is written encrypted
// with the app key (so an imported system matches the rest); otherwise plain.
// Returns the new system record.
export async function createSystemWithData(name, dataObj) {
  const sys = await createSystem({ name });
  const idb = await getIdb();
  let blob;
  if (isEncryptionActive()) {
    blob = JSON.stringify({ __encrypted: await encryptWithActiveKey(dataObj || {}), __salt: getActiveSalt(), __format_version: 2 });
  } else {
    blob = JSON.stringify(dataObj || {});
  }
  await idb.put(IDB_STORE, blob, storageKeyForSystem(sys));
  return sys;
}

// Permanently remove a system: delete its data blob, then drop the registry
// entry. Refuses to delete the ACTIVE system (you're in it — switch away
// first). Callers MUST save a backup BEFORE calling this (data-loss invariant).
export async function deleteSystem(id) {
  const reg = await ensureRegistry();
  if (id === reg.activeSystemId) throw new Error('Cannot delete the active system');
  const sys = reg.systems.find((s) => s.id === id);
  if (!sys) return reg;
  try {
    const idb = await getIdb();
    await idb.delete(IDB_STORE, storageKeyForSystem(sys));
  } catch { /* best effort — still drop the registry entry */ }
  reg.systems = reg.systems.filter((s) => s.id !== id);
  await saveRegistry(reg);
  return reg;
}

// Rename an INACTIVE system by writing the name into its own blob's
// SystemSettings (the canonical source, so refreshSystemNames keeps it) plus
// the registry. Encrypted/missing blobs fall back to a registry-only rename.
// The ACTIVE system should instead be renamed via its loaded SystemSettings so
// the running app updates immediately — see the panel's rename handler.
export async function writeSystemDisplayName(system, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  const reg = await ensureRegistry();
  const sys = reg.systems.find((s) => s.id === system.id);
  if (!sys) return;
  try {
    const idb = await getIdb();
    const raw = await idb.get(IDB_STORE, storageKeyForSystem(sys));
    if (raw != null) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object' && !parsed.__encrypted) {
        if (!parsed.SystemSettings || typeof parsed.SystemSettings !== 'object') parsed.SystemSettings = {};
        const ids = Object.keys(parsed.SystemSettings);
        if (ids.length === 0) {
          const nid = genId();
          parsed.SystemSettings[nid] = { id: nid, system_name: trimmed };
        } else {
          parsed.SystemSettings[ids[0]] = { ...parsed.SystemSettings[ids[0]], system_name: trimmed };
        }
        await idb.put(IDB_STORE, typeof raw === 'string' ? JSON.stringify(parsed) : parsed, storageKeyForSystem(sys));
      }
    }
  } catch { /* fall through to registry-only */ }
  sys.name = trimmed;
  await saveRegistry(reg);
}

// Encrypt every NON-active system's blob with the given key + salt (the active
// system is handled by localDb.enableEncryption re-saving its in-memory db).
// Reads each plain blob and writes the AES envelope; skips already-encrypted or
// missing blobs. Per-blob failures are counted, never thrown — a blob left
// plain is not data loss, just unencrypted. Returns { done, failed }.
export async function encryptOtherSystemBlobs({ activeStorageKey, key, salt }) {
  const reg = await ensureRegistry();
  const idb = await getIdb();
  let done = 0, failed = 0;
  for (const s of reg.systems) {
    const k = storageKeyForSystem(s);
    if (k === activeStorageKey) continue;
    try {
      const raw = await idb.get(IDB_STORE, k);
      if (raw == null) continue;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object' && parsed.__encrypted) continue;
      const envelope = JSON.stringify({ __encrypted: await encryptData(parsed, key), __salt: salt, __format_version: 2 });
      await idb.put(IDB_STORE, envelope, k);
      done++;
    } catch { failed++; }
  }
  return { done, failed };
}

// Inverse: decrypt every NON-active system's blob back to plain JSON. A blob
// that can't be decrypted is left as-is (still openable with the password).
export async function decryptOtherSystemBlobs({ activeStorageKey, key }) {
  const reg = await ensureRegistry();
  const idb = await getIdb();
  let done = 0, failed = 0;
  for (const s of reg.systems) {
    const k = storageKeyForSystem(s);
    if (k === activeStorageKey) continue;
    try {
      const raw = await idb.get(IDB_STORE, k);
      if (raw == null) continue;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== 'object' || !parsed.__encrypted) continue;
      const data = await decryptData(parsed.__encrypted, key);
      await idb.put(IDB_STORE, JSON.stringify(data), k);
      done++;
    } catch { failed++; }
  }
  return { done, failed };
}

export async function reorderSystems(orderedIds) {
  const reg = await ensureRegistry();
  orderedIds.forEach((id, i) => {
    const sys = reg.systems.find((s) => s.id === id);
    if (sys) sys.order = i;
  });
  await saveRegistry(reg);
  return reg;
}
