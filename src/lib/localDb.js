// Local-first database backed by IndexedDB (via idb).
// Provides the same API as base44.entities so all existing code works without changes.
// Falls back to migrating existing localStorage data on first run.

import { openDB } from 'idb';
import { encryptData, decryptData, generateSalt, deriveKey, KDF_ITERATIONS, LEGACY_KDF_ITERATIONS } from './localEncryption';
import { getEncSalt, setEncSalt, setEncryptionEnabled, setSessionPassword, clearSessionPassword } from './storageMode';
import { restoreLocalSettingsFromDb, installLocalSettingsMirror, MIRROR_KEY } from "@/lib/localSettingsMirror";

// Reserved top-level keys inside the DB blob that are NOT entity
// collections ({id: record}). Every generic walk over the blob must skip
// them. Add here whenever a new reserved key is introduced.
export const RESERVED_DB_KEYS = new Set([MIRROR_KEY]);
export const isReservedDbKey = (k) => typeof k === "string" && RESERVED_DB_KEYS.has(k);

const IDB_NAME = 'oceans_symphony';
const IDB_VERSION = 1;
const IDB_STORE = 'keyval';
const DEFAULT_STORAGE_KEY = 'symphony_local_data';
const FAKE_USER_EMAIL = 'local@symphony.app';

// The active system's blob key. Multi-system support (see systems.js) points
// this at the active system's storage slot once, on boot, BEFORE any load or
// save. It defaults to the legacy single-system key so existing data is read
// and written from exactly where it has always lived — turning multi-system on
// moves nothing. localDb does NOT import systems.js (one-way dependency, no
// cycle); systems.js calls setActiveStorageKey() during initSystemsRegistry().
let _storageKey = DEFAULT_STORAGE_KEY;
export function setActiveStorageKey(key) { _storageKey = key || DEFAULT_STORAGE_KEY; }
export function getActiveStorageKey() { return _storageKey; }

let _db = null;       // in-memory: { EntityName: { id: record } }

// ── Cross-tab write safety (v0.219.2) ──
//
// The whole DB lives in one blob, and every save overwrites it wholesale.
// With the app open in TWO same-origin contexts (a pinned PWA window plus
// a browser tab is enough), each tab held its own in-memory copy — and the
// staler tab's next save silently reverted everything the other tab had
// written since it loaded. Irregular two-context condition = the
// "sporadic random data loss" reports.
//
// Two layers:
//   1. LIVE SYNC — every successful save broadcasts on a BroadcastChannel;
//      other tabs re-read the blob into memory (decrypting with the key
//      already in memory) and tell the app to refetch. Tabs stay current,
//      so the stale-writer case all but disappears.
//   2. RESCUE BACKSTOP — a tiny generation sidecar (NOT under the data-blob
//      key prefix, so the recovery scanner never mistakes it for data) is
//      bumped on every save. If a save finds the sidecar ahead of what
//      this tab last synced, an unsynced writer got there first: the
//      on-disk blob is stashed into `<key>__rescue` BEFORE being
//      overwritten. That slot IS under the data prefix on purpose — the
//      Data Rescue panel and the boot orphan scanner list it, so even the
//      worst race never loses data permanently.
const _writerId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
let _gen = 0;            // the generation this tab last loaded or wrote
let _genKey = null;      // which storage key _gen belongs to
const genSidecarKey = () => `symphony_gen__${_storageKey}`;
const rescueKey = () => `${_storageKey}__rescue`;

async function readGenSidecar() {
  try {
    const idb = await getIdb();
    const v = await idb.get(IDB_STORE, genSidecarKey());
    return v && typeof v.gen === "number" ? v.gen : 0;
  } catch { return 0; }
}

async function writeGenSidecar(gen) {
  try {
    const idb = await getIdb();
    await idb.put(IDB_STORE, { gen, writer: _writerId, at: Date.now() }, genSidecarKey());
  } catch { /* best effort — the broadcast still fires */ }
}

let _bc = null;
function ensureSyncChannel() {
  if (_bc || typeof BroadcastChannel === "undefined") return _bc;
  try {
    _bc = new BroadcastChannel("symphony_db_sync");
    _bc.onmessage = (e) => {
      const m = e?.data;
      if (!m || m.writer === _writerId || m.key !== _storageKey) return;
      adoptExternalChange(m.gen).then((ok) => {
        if (ok) {
          try { window.dispatchEvent(new CustomEvent("symphony-db-external-change")); } catch { /* SSR */ }
        }
      });
    };
  } catch { _bc = null; }
  return _bc;
}

// Another tab saved: re-read the blob into memory. Failures keep the
// current in-memory DB — never throw mid-session, never go empty.
async function adoptExternalChange(gen) {
  if (_previewDb !== null) return false; // preview is memory-only by design
  if (_db === null) return false;        // not booted yet — init will read fresh
  try {
    const raw = await loadFromStorage();
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.__encrypted) {
      if (!_encKey) return false;
      _db = await decryptData(parsed.__encrypted, _encKey);
    } else if (parsed && typeof parsed === "object") {
      _db = parsed;
    } else {
      return false;
    }
    if (typeof gen === "number") { _gen = gen; _genKey = _storageKey; }
    return true;
  } catch { return false; }
}
let _previewDb = null; // in-memory only: when set, all reads/writes use this and skip persistence
let _encKey = null;   // CryptoKey when encryption is active
let _activeSalt = null; // salt currently in use; mirrored into the encrypted envelope on every save
let _idbPromise = null;

// Typed errors so the boot path can show a real recovery UI instead of
// silently returning an empty DB (which the user would see as data loss).
export class EncryptedDataWithoutKeyError extends Error {
  constructor() {
    super('Stored data is encrypted; password required to unlock.');
    this.name = 'EncryptedDataWithoutKeyError';
  }
}
export class StorageReadError extends Error {
  constructor(cause) {
    super('Could not read stored data from this device.');
    this.name = 'StorageReadError';
    this.cause = cause;
  }
}
export class CorruptedDataError extends Error {
  constructor(cause) {
    super('Stored data is unreadable (corrupted or wrong format).');
    this.name = 'CorruptedDataError';
    this.cause = cause;
  }
}
export class MissingSaltError extends Error {
  constructor() {
    super('Encryption salt is missing; data cannot be decrypted on this device.');
    this.name = 'MissingSaltError';
  }
}

function getIdb() {
  if (!_idbPromise) {
    _idbPromise = openDB(IDB_NAME, IDB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      },
    });
  }
  return _idbPromise;
}

// Returns the raw stored string, or null if no data exists in either store.
// Throws StorageReadError ONLY when IDB itself errored AND localStorage had
// nothing to fall back on — in that case the caller must surface a recovery
// UI instead of treating an empty DB as "user is new".
// Split-brain guard (v0.95.2): when an IDB write fails and the blob falls
// back to localStorage, this flag records that localStorage holds the
// NEWER copy — otherwise the next boot would prefer the stale IDB blob
// and the write (e.g. a whole import) would silently revert.
const lsAuthorityKey = () => `symphony_ls_authoritative:${_storageKey}`;

async function loadFromStorage() {
  let idbValue = undefined;
  let idbError = null;
  try {
    const idb = await getIdb();
    idbValue = await idb.get(IDB_STORE, _storageKey);
  } catch (e) {
    idbError = e;
  }
  // Honour the fallback-write flag: localStorage is newer than IDB.
  try {
    if (localStorage.getItem(lsAuthorityKey())) {
      const ls = localStorage.getItem(_storageKey);
      if (ls) {
        // Best-effort re-home into IDB so the stores reconverge.
        if (!idbError) {
          try {
            const idb = await getIdb();
            await idb.put(IDB_STORE, ls, _storageKey);
            localStorage.removeItem(lsAuthorityKey());
          } catch { /* keep the flag — localStorage stays authoritative */ }
        }
        return ls;
      }
      localStorage.removeItem(lsAuthorityKey());
    }
  } catch { /* storage off — fall through to IDB value */ }
  if (idbValue !== undefined) return idbValue;

  // One-time migration from localStorage to IndexedDB (if IDB is healthy).
  const legacy = localStorage.getItem(_storageKey);
  if (legacy) {
    if (!idbError) {
      try {
        const idb = await getIdb();
        await idb.put(IDB_STORE, legacy, _storageKey);
        localStorage.removeItem(_storageKey);
      } catch { /* migration best-effort; data already in the legacy slot */ }
    }
    return legacy;
  }

  if (idbError) throw new StorageReadError(idbError);
  return null;
}

async function saveToStorage(value) {
  try {
    const idb = await getIdb();
    await idb.put(IDB_STORE, value, _storageKey);
    // Successful IDB write supersedes any earlier fallback copy.
    try { localStorage.removeItem(lsAuthorityKey()); } catch { /* ok */ }
  } catch {
    // IDB write failed — localStorage now holds the newest copy, and the
    // authority flag makes loadFromStorage prefer it over the stale IDB
    // blob (otherwise this save — possibly a whole import — silently
    // reverts on the next boot).
    localStorage.setItem(_storageKey, value);
    try { localStorage.setItem(lsAuthorityKey(), String(Date.now())); } catch { /* ok */ }
  }
}

// Read-only inspection of the stored blob without loading it into memory or
// requiring a password. Used by App.jsx on boot to decide whether the user
// is genuinely new vs. has existing data that needs unlock/recovery — even
// when localStorage has been cleared and the encryption flag is gone.
//
// Returns one of:
//   { exists: false }
//   { exists: true, encrypted: false, raw }
//   { exists: true, encrypted: true,  salt: <string|null>, raw }
//   { exists: true, corrupted: true,  raw }   ← raw was non-empty but unparseable
// Throws StorageReadError if the storage layer itself is unreadable.
export async function peekStoredData() {
  const raw = await loadFromStorage();
  if (!raw) return { exists: false };
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return { exists: true, corrupted: true, raw }; }
  if (parsed && typeof parsed === 'object' && parsed.__encrypted) {
    return {
      exists: true,
      encrypted: true,
      salt: parsed.__salt || null,
      raw,
    };
  }
  return { exists: true, encrypted: false, raw };
}

// Returns the raw on-disk blob (encrypted ciphertext or plain JSON) for
// emergency export from the recovery screen. Lets users save a copy of
// their unreadable data before resetting, so support / a future fix can
// recover it.
export async function exportRawStorageBlob() {
  return await loadFromStorage();
}

// Non-destructive password check. Reads the stored blob, derives a key
// from the supplied password against the persisted salt, and attempts
// to decrypt — returning true on success, false on failure. Does NOT
// mutate `_db` / `_encKey` / `_activeSalt`, so it's safe to call while
// the user is already unlocked. Used by surfaces that gate a sensitive
// toggle behind "prove you're the owner" (e.g. disabling the grocery
// privacy-cover lock). Returns false (rather than throwing) when there
// is no encrypted data or no salt to verify against.
export async function verifyPassword(password) {
  if (!password) return false;
  const raw = await loadFromStorage();
  if (!raw) return false;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return false; }
  if (!parsed || typeof parsed !== 'object' || !parsed.__encrypted) return false;
  const salt = parsed.__salt || getEncSalt();
  if (!salt) return false;
  // Same both-strengths rule as initLocalDb (envelopes missing
  // __kdf_iterations may have been written at the current strength).
  const recorded = parsed.__kdf_iterations || LEGACY_KDF_ITERATIONS;
  for (const iterations of [recorded, recorded === KDF_ITERATIONS ? LEGACY_KDF_ITERATIONS : KDF_ITERATIONS]) {
    try {
      const key = await deriveKey(password, salt, iterations);
      await decryptData(parsed.__encrypted, key);
      return true;
    } catch { /* try the other strength */ }
  }
  return false;
}

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Deletion tombstones (v0.95.3 — device sync) ────────────────────
// Every entity delete records { entity, record_id, deleted_at } in the
// DeletionLog table (exported with backups). Without tombstones a merge
// can't distinguish "deleted on device A" from "never existed on A", so
// records deleted on one device resurrect from the other's backup.
// Tombstones are only ACTED ON when the user explicitly opts into
// deletion-sync at import time — a plain "Add new" import stays purely
// additive so old backups can still be used to recover deleted data.
const TOMBSTONE_SKIP = new Set(["DeletionLog", "FriendIdentity", "PushSubscription"]);
const TOMBSTONE_MAX = 2000;
const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 3600 * 1000;

function recordDeletionTombstone(entityName, id) {
  try {
    if (TOMBSTONE_SKIP.has(entityName) || _previewDb !== null) return;
    const db = getDb();
    if (!db.DeletionLog) db.DeletionLog = {};
    const key = `${entityName}:${id}`;
    db.DeletionLog[key] = { id: key, entity: entityName, record_id: id, deleted_at: new Date().toISOString() };
    // Prune: drop tombstones past the age cap, then oldest beyond the
    // count cap — sync only needs the recent-history window.
    const rows = Object.values(db.DeletionLog);
    if (rows.length > TOMBSTONE_MAX) {
      const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
      const sorted = rows.sort((a, b) => new Date(a.deleted_at) - new Date(b.deleted_at));
      const excess = sorted.length - TOMBSTONE_MAX;
      sorted.forEach((r, i) => {
        if (i < excess || new Date(r.deleted_at).getTime() < cutoff) delete db.DeletionLog[r.id];
      });
    }
  } catch { /* tombstones are best-effort — never block a delete */ }
}

function getDb() {
  if (_previewDb !== null) return _previewDb;
  if (_db !== null) return _db;
  // Hard error rather than silent empty: returning {} here previously
  // let early callers seed an empty in-memory DB that would then
  // overwrite the real one on the next save. See User Data Preservation
  // notes in CLAUDE.md.
  throw new Error('localDb accessed before initLocalDb completed');
}

// Serialize saves (v0.95.2). saveDb used to snapshot _db synchronously and
// then await encryption + the IDB put with NO ordering guarantee — a slow
// save (encryption does an expensive encode on big blobs) that started
// BEFORE a big write like an import could land AFTER it and clobber the
// whole import with pre-import state. The queue makes saves strictly
// sequential AND makes each queued save serialize the LATEST _db at its
// turn, so a stale snapshot can never win. Callers still just await saveDb().
let _saveQueue = Promise.resolve();

// ── Write batching ────────────────────────────────────────────────────
// Every entity write calls saveDb(), which serialises (and, under
// encryption, re-encrypts) the ENTIRE db. A loop of N updates = N full-DB
// round trips: a front switch touching 10 sessions did 10 encrypts; a
// 2,000-row import did 2,000. withBatch(fn) suppresses the per-write save
// for the duration of fn and flushes ONCE at the end (or on throw, so a
// partial batch is still persisted — the in-memory writes already
// happened and must not be lost). Nestable; only the outermost flushes.
// The code inside is unchanged — same order, same errors — only the disk
// write count changes.
let _batchDepth = 0;
let _batchDirty = false;

export async function withBatch(fn) {
  _batchDepth++;
  try {
    return await fn();
  } finally {
    _batchDepth--;
    if (_batchDepth === 0 && _batchDirty) {
      _batchDirty = false;
      await _saveDbNow();
    }
  }
}

function saveDb() {
  if (_batchDepth > 0) { _batchDirty = true; return Promise.resolve(); }
  return _saveDbNow();
}

function _saveDbNow() {
  const run = _saveQueue.then(() => doSaveDb());
  // Keep the chain alive even if a save fails; the failure still
  // propagates to this call's awaiter.
  _saveQueue = run.catch(() => {});
  return run;
}

async function doSaveDb() {
  // Preview-mode writes stay purely in memory and never reach IndexedDB.
  if (_previewDb !== null) return;
  // Stale-writer backstop: if the generation sidecar moved past what this
  // tab last synced, an unsynced writer saved since — stash the on-disk
  // blob before overwriting it so nothing is ever unrecoverable.
  let diskGen = 0;
  try {
    if (_genKey !== _storageKey) { _gen = await readGenSidecar(); _genKey = _storageKey; }
    diskGen = await readGenSidecar();
    if (diskGen > _gen) {
      const current = await loadFromStorage();
      if (current) {
        try {
          const idb = await getIdb();
          await idb.put(IDB_STORE, current, rescueKey());
          console.warn("[localDb] concurrent write detected — previous blob stashed in", rescueKey());
        } catch { /* stash is best-effort; the save still proceeds */ }
      }
    }
  } catch { /* backstop only — never block the save */ }
  let json;
  if (_encKey) {
    // Embed the salt INSIDE the encrypted envelope so the data is still
    // decryptable even if localStorage is wiped (Android device cleaners
    // commonly clear localStorage but leave IndexedDB intact, which would
    // otherwise lose the salt and make decryption impossible).
    json = JSON.stringify({
      __encrypted: await encryptData(_db, _encKey),
      __salt: _activeSalt || getEncSalt(),
      __format_version: 2,
      // Record the PBKDF2 strength this envelope's key was derived with.
      // _encKey is always at KDF_ITERATIONS once init/enable completes
      // (legacy blobs are re-keyed on first successful unlock).
      __kdf_iterations: KDF_ITERATIONS,
    });
  } else {
    json = JSON.stringify(_db);
  }
  await saveToStorage(json);
  // Advance the generation and tell every other tab to catch up.
  _gen = Math.max(_gen, diskGen) + 1;
  _genKey = _storageKey;
  await writeGenSidecar(_gen);
  try { ensureSyncChannel()?.postMessage({ key: _storageKey, gen: _gen, writer: _writerId }); } catch { /* ok */ }
}

// Preview mode: replace the in-memory DB with curated example data.
// Real user data on disk is never touched. Calling clearPreviewDb()
// returns to the real DB exactly as it was.
export function setPreviewDb(data) {
  _previewDb = data || {};
}

export function clearPreviewDb() {
  _previewDb = null;
}

export function isPreviewDbActive() {
  return _previewDb !== null;
}

// Called on app start. Password required only when encryption is enabled.
//
// Safety contract:
//   - NEVER silently set `_db = {}` when stored data exists. If we can't
//     read or decrypt it, throw a typed error so the boot UI can route to
//     the recovery screen instead of showing the user an empty app.
//   - Recover the encryption flag and salt from the stored envelope when
//     localStorage has been wiped (Android cleaners do this regularly).
// Runs at EVERY successful initLocalDb exit (first-run, encrypted,
// plain): restore allow-listed preferences that a localStorage wipe took
// (from the mirror inside the blob), then start mirroring future changes.
// Additive and non-throwing — the boot-path invariants above are untouched.
function finalizeInit() {
  try {
    if (_db && typeof _db === "object") restoreLocalSettingsFromDb(_db);
    installLocalSettingsMirror(() => _db, saveDb);
  } catch (e) { console.warn("[localDb] settings mirror init failed", e); }
}

export async function initLocalDb(password) {
  // Cross-tab sync: listen from boot so a save in another tab refreshes
  // this one even before this tab's own first write; seed the generation
  // from the sidecar so the first save can tell whether anyone else has
  // written since.
  ensureSyncChannel();
  _gen = await readGenSidecar();
  _genKey = _storageKey;
  // loadFromStorage throws StorageReadError only when both IDB and
  // localStorage are unreachable AND empty.
  const raw = await loadFromStorage();

  // First-run path: no data anywhere.
  if (!raw) {
    _db = {};
    if (password) {
      // First-run user opted into encryption — set up the key now so
      // their first save lands as encrypted ciphertext.
      let salt = getEncSalt();
      if (!salt) { salt = await generateSalt(); setEncSalt(salt); }
      _activeSalt = salt;
      _encKey = await deriveKey(password, salt, KDF_ITERATIONS);
      setEncryptionEnabled(true);
      setSessionPassword(password);
    } else {
      _activeSalt = null;
      _encKey = null;
    }
    finalizeInit();
    return;
  }

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    // Stored blob is non-empty but unparseable. Refuse to clobber it.
    _db = null;
    _encKey = null;
    throw new CorruptedDataError(e);
  }

  // Encrypted envelope.
  if (parsed && typeof parsed === 'object' && parsed.__encrypted) {
    if (!password) {
      // CRITICAL: previously this path silently returned `_db = {}` which
      // looked like total data loss to the user. Throw instead so the UI
      // can prompt for the password or open the recovery screen.
      _db = null;
      _encKey = null;
      throw new EncryptedDataWithoutKeyError();
    }
    // Prefer the salt embedded in the envelope — survives localStorage
    // wipes. Fall back to the localStorage copy for legacy blobs that
    // pre-date envelope versioning.
    const salt = parsed.__salt || getEncSalt();
    if (!salt) {
      _db = null;
      _encKey = null;
      throw new MissingSaltError();
    }
    // Restore localStorage flags so the rest of the app sees a consistent
    // state (Settings → encryption indicator, etc.).
    setEncSalt(salt);
    setEncryptionEnabled(true);
    _activeSalt = salt;
    // Try the recorded strength first, then the OTHER one before calling
    // the password wrong. Multi-system blobs written between the KDF bump
    // and v0.180.0 (createSystemWithData / appendEntitiesToSystem) omitted
    // __kdf_iterations while being encrypted at KDF_ITERATIONS — a reader
    // that only tried the legacy default declared "Incorrect password" on
    // a correct password and the data looked lost. It isn't; it decrypts
    // at the other strength, and the upgrade below then re-stamps it.
    const recorded = parsed.__kdf_iterations || LEGACY_KDF_ITERATIONS;
    const alternate = recorded === KDF_ITERATIONS ? LEGACY_KDF_ITERATIONS : KDF_ITERATIONS;
    let storedIterations = recorded;
    let key = await deriveKey(password, salt, recorded);
    let decrypted;
    try {
      decrypted = await decryptData(parsed.__encrypted, key);
    } catch {
      let altKey = null;
      try {
        altKey = await deriveKey(password, salt, alternate);
        decrypted = await decryptData(parsed.__encrypted, altKey);
        storedIterations = alternate;
        key = altKey;
      } catch {
        _encKey = null;
        _db = null;
        throw new Error('Incorrect password');
      }
    }
    // KDF upgrade on unlock: if this blob was written at a lower PBKDF2
    // strength, re-derive the session key at the current strength and
    // re-save so the at-rest envelope upgrades. We hold the password only
    // here, so this is the one safe moment to re-key. Failure to upgrade
    // is non-fatal — the blob simply stays at its old strength and the
    // key reverts to the one that matches it (never a mismatch).
    if (storedIterations !== KDF_ITERATIONS) {
      _encKey = await deriveKey(password, salt, KDF_ITERATIONS);
      _db = decrypted;
      try {
        await saveDb();
      } catch {
        _encKey = key; // keep key + envelope consistent at the old strength
      }
    } else {
      _encKey = key;
      _db = decrypted;
    }
    // Hold the password for this app session so switching to another encrypted
    // system auto-unlocks (one password for the whole app).
    setSessionPassword(password);
    finalizeInit();
    return;
  }

  // Plain (unencrypted) data. Load it as-is. If the user supplied a
  // password but the stored data isn't encrypted, ignore the password —
  // they can flip encryption on later via Settings.
  _encKey = null;
  _activeSalt = null;
  _db = parsed;
  finalizeInit();
}

export async function enableEncryption(password) {
  const db = getDb();
  let salt = getEncSalt();
  if (!salt) { salt = await generateSalt(); setEncSalt(salt); }
  _activeSalt = salt;
  _encKey = await deriveKey(password, salt, KDF_ITERATIONS);
  setEncryptionEnabled(true);
  _db = db;
  await saveDb(); // encrypts the ACTIVE system's blob
  // One password for the whole app: encrypt EVERY other system's blob too, with
  // the same key + salt, so "encryption on" means all systems. Dynamic import
  // avoids a static localDb⇄systems cycle. Non-fatal per-blob (a blob that
  // can't be re-encrypted stays plain; nothing is lost).
  try {
    const { encryptOtherSystemBlobs } = await import('./systems');
    await encryptOtherSystemBlobs({ activeStorageKey: _storageKey, key: _encKey, salt });
  } catch { /* other systems encrypt when next saved while encryption is on */ }
  // The shared Friends identity (relay secret + E2E private key) follows the
  // mode: seal it now that a key exists. Dynamic import (store imports us).
  try { const m = await import('./friendIdentityStore'); await m.resealSharedFriendIdentity(); } catch { /* best-effort */ }
  setSessionPassword(password);
}

export async function disableEncryption(password) {
  await initLocalDb(password); // decrypts + loads the active system; _encKey set
  // Decrypt every OTHER system's blob while we still hold the key. Pass the
  // password too: sibling blobs may still be at a different (legacy) PBKDF2
  // strength than the active session key, so the helper derives a matching
  // key per blob from its own envelope metadata.
  try {
    const { decryptOtherSystemBlobs } = await import('./systems');
    await decryptOtherSystemBlobs({ activeStorageKey: _storageKey, key: _encKey, password });
  } catch { /* a blob left encrypted is still openable with this password */ }
  // Unseal the shared Friends identity while we STILL hold the key — after
  // _encKey is cleared a sealed identity would be unopenable.
  try {
    const m = await import('./friendIdentityStore');
    const oldKey = _encKey;
    await m.resealSharedFriendIdentity({ readWith: (payload) => decryptData(payload, oldKey), plain: true });
  } catch { /* best-effort */ }
  _encKey = null;
  _activeSalt = null;
  setEncryptionEnabled(false);
  clearSessionPassword();
  await saveDb(); // active system written back as plain
}

export const isDbInitialized = () => _db !== null;
export const clearSession = () => { _db = null; _encKey = null; _activeSalt = null; clearSessionPassword(); };

// Encryption accessors for multi-system backup/restore: read/write OTHER
// systems' blobs with the active in-memory key (set after unlock). Used so the
// "export all systems" / restore paths can decrypt sibling systems for export
// and write imported systems in the same encrypted-or-plain state as the rest.
export const isEncryptionActive = () => !!_encKey;
export const getActiveSalt = () => _activeSalt || getEncSalt();
export async function encryptWithActiveKey(data) {
  if (!_encKey) return null;
  return await encryptData(data, _encKey);
}
export async function decryptWithActiveKey(payload) {
  if (!_encKey) throw new Error('No active encryption key (locked)');
  return await decryptData(payload, _encKey);
}

function getCollection(entityName) {
  const db = getDb();
  if (!db[entityName]) db[entityName] = {};
  return db[entityName];
}

function parseSortKey(sort) {
  if (!sort) return { field: 'created_date', desc: true };
  const desc = sort.startsWith('-');
  return { field: desc ? sort.slice(1) : sort, desc };
}

function sortRecords(records, sort) {
  const { field, desc } = parseSortKey(sort);
  return [...records].sort((a, b) => {
    const av = a[field] ?? '';
    const bv = b[field] ?? '';
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return desc ? -cmp : cmp;
  });
}

function matchesQuery(record, query) {
  if (!query || Object.keys(query).length === 0) return true;
  return Object.entries(query).every(([k, v]) => record[k] === v);
}

const _listeners = {};
function emit(entityName, event) {
  (_listeners[entityName] || []).forEach(fn => fn(event));
}

export function createLocalDbEntities() {
  return new Proxy({}, {
    get(_, entityName) {
      return {
        list: async (sort, limit) => {
          let records = Object.values(getCollection(entityName));
          records = sortRecords(records, sort);
          if (limit) records = records.slice(0, limit);
          return records;
        },
        filter: async (query, sort, limit) => {
          let records = Object.values(getCollection(entityName)).filter(r => matchesQuery(r, query));
          records = sortRecords(records, sort);
          if (limit) records = records.slice(0, limit);
          return records;
        },
        get: async (id) => getCollection(entityName)[id] || null,
        create: async (data) => {
          const col = getCollection(entityName);
          const now = new Date().toISOString();
          const record = { ...data, id: generateId(), created_date: now, updated_date: now, created_by: FAKE_USER_EMAIL };
          col[record.id] = record;
          await saveDb();
          emit(entityName, { type: 'create', id: record.id, data: record });
          return record;
        },
        update: async (id, data) => {
          const col = getCollection(entityName);
          if (!col[id]) throw new Error(`Record ${id} not found in ${entityName}`);
          col[id] = { ...col[id], ...data, updated_date: new Date().toISOString() };
          await saveDb();
          emit(entityName, { type: 'update', id, data: col[id] });
          return col[id];
        },
        delete: async (id) => {
          const col = getCollection(entityName);
          delete col[id];
          recordDeletionTombstone(entityName, id);
          await saveDb();
          emit(entityName, { type: 'delete', id });
        },
        bulkCreate: async (items) => {
          const col = getCollection(entityName);
          const now = new Date().toISOString();
          const created = items.map(data => {
            const record = { ...data, id: generateId(), created_date: now, updated_date: now, created_by: FAKE_USER_EMAIL };
            col[record.id] = record;
            return record;
          });
          await saveDb();
          for (const r of created) emit(entityName, { type: 'create', id: r.id, data: r });
          return created;
        },
        // ONE save for N updates. Every single update() re-serialises (and,
        // under encryption, re-encrypts) the ENTIRE db — a front switch that
        // touched 10 sessions cost 10 full-DB round trips (audit v0.180.1).
        // `patches` = [{ id, data }]; missing ids are skipped (returned in
        // `missing`) rather than throwing so one stale id can't abort the
        // whole batch. Events fire per record after the single save.
        bulkUpdate: async (patches) => {
          const col = getCollection(entityName);
          const now = new Date().toISOString();
          const updated = [];
          const missing = [];
          for (const { id, data } of patches || []) {
            if (!id || !col[id]) { missing.push(id); continue; }
            col[id] = { ...col[id], ...data, updated_date: now };
            updated.push(col[id]);
          }
          if (updated.length) await saveDb();
          for (const r of updated) emit(entityName, { type: 'update', id: r.id, data: r });
          return { updated, missing };
        },
        // ONE save for N deletes (per-record tombstones + events preserved).
        bulkDelete: async (ids) => {
          const col = getCollection(entityName);
          const removed = [];
          for (const id of ids || []) {
            if (!id || !(id in col)) continue;
            delete col[id];
            recordDeletionTombstone(entityName, id);
            removed.push(id);
          }
          if (removed.length) await saveDb();
          for (const id of removed) emit(entityName, { type: 'delete', id });
          return removed.length;
        },
        schema: async () => ({}),
        subscribe: (callback) => {
          if (!_listeners[entityName]) _listeners[entityName] = [];
          _listeners[entityName].push(callback);
          return () => {
            _listeners[entityName] = (_listeners[entityName] || []).filter(fn => fn !== callback);
          };
        },
      };
    }
  });
}

export function createLocalAuth() {
  const FAKE_USER = { id: 'local-user', email: FAKE_USER_EMAIL, full_name: 'Local User', role: 'admin' };
  return {
    me: async () => {
      const { getLocalUser } = await import('./storageMode');
      return { ...FAKE_USER, ...(getLocalUser() || {}) };
    },
    updateMe: async (data) => {
      const { setLocalUser, getLocalUser } = await import('./storageMode');
      setLocalUser({ ...(getLocalUser() || {}), ...data });
    },
    logout: () => { clearSession(); window.location.reload(); },
    redirectToLogin: () => {},
    isAuthenticated: async () => true,
  };
}

export function getFullDbDump() {
  return { ...getDb() };
}

// Deletes every record across the given entity names in a SINGLE saveDb()
// call, instead of one saveDb() per record (the Proxy's delete(id) does
// exactly that). Under encryption, saveDb() re-serializes and re-encrypts
// the WHOLE db blob every call — looping delete(id) across a large
// category would mean one full-blob encryption per record. Still emits a
// 'delete' event per record for any .subscribe() consumer, matching the
// Proxy's per-record delete behavior. Purely additive — doesn't touch
// initLocalDb or any boot-path invariant.
export async function bulkDeleteEntities(entityNames) {
  const db = getDb();
  let totalDeleted = 0;
  const deletedIdsByEntity = {};
  for (const entityName of entityNames) {
    const col = db[entityName];
    if (!col) continue;
    const ids = Object.keys(col);
    for (const id of ids) delete col[id];
    deletedIdsByEntity[entityName] = ids;
    totalDeleted += ids.length;
  }
  await saveDb();
  for (const [entityName, ids] of Object.entries(deletedIdsByEntity)) {
    for (const id of ids) emit(entityName, { type: 'delete', id });
  }
  return totalDeleted;
}

// Rewrites every local-image:// URL in the DB to /local-image/[id]
// so the Service Worker can intercept them. Safe to run on every startup —
// exits fast once all URLs are already in the new format.
function rewriteLocalImageUrls(value) {
  if (typeof value === 'string') {
    if (value.startsWith('local-image://')) {
      return { changed: true, value: `/local-image/${value.slice('local-image://'.length)}` };
    }
    return { changed: false, value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const result = value.map((item) => {
      const r = rewriteLocalImageUrls(item);
      if (r.changed) changed = true;
      return r.value;
    });
    return { changed, value: result };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      const r = rewriteLocalImageUrls(v);
      if (r.changed) changed = true;
      result[k] = r.value;
    }
    return { changed, value: result };
  }
  return { changed: false, value };
}

export async function migrateLocalImageUrlScheme() {
  const db = getDb();
  let migrated = 0;
  for (const [entityName, collection] of Object.entries(db)) {
    if (isReservedDbKey(entityName)) continue;
    if (!collection || typeof collection !== 'object') continue;
    for (const [recordId, record] of Object.entries(collection)) {
      if (!record || typeof record !== 'object') continue;
      const { changed, value } = rewriteLocalImageUrls(record);
      if (changed) {
        db[entityName][recordId] = value;
        migrated++;
      }
    }
  }
  if (migrated > 0) await saveDb();
  return migrated;
}

// Device-bound entities never arrive via a general import. FriendIdentity
// carries a permanent bearer secret + the E2E private key — a dump from
// another person (or an old auto-backup, which leaked these before
// v0.95.2) must not silently make this device BECOME that identity.
// Adoption happens only through the explicit consent flow, which passes
// { allowDeviceBound: true } after the user confirms whose identity it is.
const DEVICE_BOUND_IMPORT_BLOCK = ["FriendIdentity", "PushSubscription"];
function sanitizeIncomingDump(dump, { allowDeviceBound = false } = {}) {
  if (!dump || typeof dump !== "object" || allowDeviceBound) return dump;
  const out = { ...dump };
  for (const name of DEVICE_BOUND_IMPORT_BLOCK) delete out[name];
  return out;
}

// NOTE: preserving THIS device's identity across a replace-import is the
// caller's job (DataBackupRestore already carries it forward explicitly);
// wipe flows (loadDbDump({})) genuinely mean "everything gone".
export async function loadDbDump(dump, options = {}) {
  const next = sanitizeIncomingDump(dump, options);
  // Preferences mirror: this device's own wins if present; a fresh device
  // (no mirror yet) adopts the file's so a restore brings the look along.
  const ownMirror = _db && typeof _db === "object" ? _db[MIRROR_KEY] : null;
  if (next && typeof next === "object" && ownMirror && !options.adoptMirror) next[MIRROR_KEY] = ownMirror;
  _db = next;
  await saveDb();
}

// Permanently remove the stored DB blob from BOTH IndexedDB and
// localStorage so the next boot's peekStoredData() reports
// { exists: false } and the app routes to first-run onboarding.
// `loadDbDump({})` is not enough on its own — it persists an empty
// "{}" record, which the boot path reads as a returning (empty) user
// and skips onboarding. Used by the "Delete all local data" action.
export async function clearStoredData() {
  _db = {};
  try {
    const idb = await getIdb();
    await idb.delete(IDB_STORE, _storageKey);
  } catch { /* fall through to localStorage cleanup */ }
  try { localStorage.removeItem(_storageKey); } catch { /* ignore */ }
}

// Add-only merge: only inserts records whose IDs don't already exist locally.
// Existing records are never overwritten.
//
// Special case: SystemSettings is a singleton entity (one record per
// system). When the app first boots it auto-creates an empty default
// record so the terms-setup flow has somewhere to write. If a user then
// imports a backup in "Add new" mode, the imported SystemSettings row
// would end up sitting alongside the empty local stub, and read-sites
// that grab `list()[0]` may surface the empty stub — making restored
// system name / bio / avatar appear blank. To prevent that we fold any
// incoming SystemSettings into existing local stubs field-by-field:
// only fields that are currently empty on the local record receive the
// imported value, so nothing the user has actively set is ever
// clobbered. The imported record itself is dropped (its data has been
// absorbed into the local record), keeping the singleton invariant.
function isEmptyValue(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

// Content identity for entities whose default/preset rows auto-seed with
// fresh RANDOM ids on first use (symptom presets, grounding techniques,
// relationship-type catalogues, daily-task templates…). A backup made after
// seeding carries the same rows under DIFFERENT ids, so the plain "skip if
// id exists" merge below would duplicate every preset — two "Anxiety"
// symptoms, two "Friends" relationship types, etc. When local rows exist,
// incoming rows whose content key matches a local one are skipped; the
// local row wins so user tweaks survive the import. (Same lineage as the
// PR #91 SystemSettings singleton fix; generalised after multi-system
// backup testing surfaced duplicated symptom/habit presets.)
const MERGE_CONTENT_KEYS = {
  DailyTaskTemplate: (r) => {
    const t = String(r.title || "").trim().toLowerCase();
    return t ? `${t}::${r.frequency || "daily"}` : null;
  },
  GroundingPreference: (r) => (r.technique_id ? String(r.technique_id) : null),
  Symptom: (r) => {
    const l = String(r.label || "").trim().toLowerCase();
    return l ? `${l}::${r.category || "symptom"}` : null;
  },
  GroundingTechnique: (r) => String(r.name || "").trim().toLowerCase() || null,
  RelationshipType: (r) => String(r.label || "").trim().toLowerCase() || null,
  ContactRelationshipType: (r) => String(r.label || "").trim().toLowerCase() || null,
};

// Entities whose "current state" flags must never be silently altered by an
// Add-new import: FrontingSession's is_active / is_primary. If the local
// system already has an active fronter, incoming active sessions come in as
// HISTORICAL rows (is_active + is_primary flipped to false) so the user's
// live front stays exactly as they left it. Without this, importing an
// old / wrong backup silently reassigned who's fronting (tester report,
// v0.86.7 → v0.86.8).
function _hasActiveFrontingSession(existing) {
  if (!existing || typeof existing !== "object") return false;
  for (const row of Object.values(existing)) {
    if (row && row.is_active === true) return true;
  }
  return false;
}
function _sanitizeIncomingFrontingSessions(incomingRecords, existingRecords) {
  if (!_hasActiveFrontingSession(existingRecords)) return incomingRecords;
  const out = {};
  for (const [id, record] of Object.entries(incomingRecords || {})) {
    if (!record || typeof record !== "object") { out[id] = record; continue; }
    if (record.is_active === true || record.is_primary === true) {
      // Historical import — set end_time so the session isn't ambiguous.
      out[id] = {
        ...record,
        is_active: false,
        is_primary: false,
        end_time: record.end_time || record.start_time || new Date().toISOString(),
      };
    } else {
      out[id] = record;
    }
  }
  return out;
}

// Merge an incoming record into an existing SAME-ID local record.
// This is what makes "Update & add new" actually UPDATE (tester report:
// avatars/roles edited on desktop never propagated to the phone because
// the old merge skipped every id that already existed locally — the
// "update" in the label was a lie).
//
// Rules (data-safety first):
//   - Incoming strictly NEWER (updated_date): incoming non-empty fields
//     win — the desktop edit propagates. Incoming EMPTY fields never
//     blank a local value (deletions don't propagate; conservative).
//   - Incoming same-or-older: only fills local fields that are EMPTY
//     (repairs half-imported records without touching user edits).
//   - id / created_date never change; updated_date takes the newer.
// Exported for the merge test harness.
export function mergeExistingRecord(local, incoming, { newerWins = true } = {}) {
  if (!incoming || typeof incoming !== "object") return local;
  if (!local || typeof local !== "object") return incoming;
  const localTime = Date.parse(local.updated_date || "") || 0;
  const incomingTime = Date.parse(incoming.updated_date || "") || 0;
  const incomingNewer = newerWins && incomingTime > localTime;
  const out = { ...local };
  let changed = false;
  for (const [field, value] of Object.entries(incoming)) {
    if (field === "id" || field === "created_date" || field === "updated_date") continue;
    if (isEmptyValue(value)) continue;
    if (incomingNewer || isEmptyValue(out[field])) {
      if (out[field] !== value) { out[field] = value; changed = true; }
    }
  }
  if (incomingNewer && changed) out.updated_date = incoming.updated_date;
  return out;
}

// Fields ignored when deciding whether two versions of a record actually
// differ (metadata that always differs harmlessly).
const CONFLICT_META = new Set(["id", "created_date", "updated_date", "created_by"]);
function recordsMateriallyDiffer(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if (CONFLICT_META.has(k)) continue;
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) return true;
  }
  return false;
}

// Restore/overwrite one record EXACTLY as given (id preserved, timestamps
// untouched) — used by the import conflict-review UI when the user picks
// the version that lost the automatic merge.
export async function restoreRecord(entityName, record) {
  if (!record?.id) return;
  if (!_db[entityName]) _db[entityName] = {};
  _db[entityName][record.id] = record;
  await saveDb();
  emit(entityName, { type: 'update', id: record.id, data: record });
}

export async function deleteRecordRaw(entityName, id) {
  if (_db[entityName]?.[id] === undefined) return;
  delete _db[entityName][id];
  recordDeletionTombstone(entityName, id);
  await saveDb();
  emit(entityName, { type: 'delete', id });
}

export async function mergeDbDump(dump, options = {}) {
  if (!_db) _db = {};
  const sanitized = sanitizeIncomingDump(dump, options);
  const applyDeletions = options.applyDeletions === true;
  // Conflict collection (v0.95.4): every place the merge had to CHOOSE
  // between two real versions is recorded so the import UI can offer the
  // user the losing version. `kept` names the side the automatic rule
  // applied; both full snapshots ride along for the review sheet.
  const conflicts = [];
  const noteEditConflict = (entityName, id, local, incoming) => {
    if (!local || !incoming) return;
    const lt = Date.parse(local.updated_date || "") || 0;
    const it = Date.parse(incoming.updated_date || "") || 0;
    if (lt === it) return; // same edit generation — merge is a no-op or pure fill
    if (!recordsMateriallyDiffer(local, incoming)) return;
    conflicts.push({
      entity: entityName, id,
      local: { ...local }, incoming: { ...incoming },
      kept: it > lt ? "incoming" : "local",
      reason: "edit",
    });
  };
  // Local tombstones — used (only in deletion-sync mode) to stop records
  // this device deliberately deleted from resurrecting out of the other
  // device's backup. A record edited on the other device AFTER our
  // deletion (updated_date > deleted_at) still comes back — the newer
  // intent wins.
  const localTombstones = applyDeletions ? { ...( _db.DeletionLog || {}) } : {};
  const tombstoneBlocks = (entityName, id, record) => {
    if (!applyDeletions) return false;
    const t = localTombstones[`${entityName}:${id}`];
    if (!t) return false;
    const recTime = Date.parse(record?.updated_date || record?.created_date || "") || 0;
    return (Date.parse(t.deleted_at || "") || 0) > recTime;
  };
  for (const [entityName, incoming] of Object.entries(sanitized)) {
    // The settings mirror is THIS device's state — a merge from another
    // device's file must not overwrite it (their look isn't ours).
    if (isReservedDbKey(entityName)) continue;
    if (!incoming || typeof incoming !== "object") continue;
    if (!_db[entityName]) _db[entityName] = {};

    // Guard the current-front state before anything is written.
    const records = entityName === "FrontingSession"
      ? _sanitizeIncomingFrontingSessions(incoming, _db[entityName])
      : incoming;

    if (entityName === "SystemSettings") {
      const localIds = Object.keys(_db[entityName]);
      const incomingIds = Object.keys(records);
      // If a local SystemSettings record already exists, fold the
      // incoming row(s) into it field-by-field rather than adding a
      // second record alongside.
      if (localIds.length > 0 && incomingIds.length > 0) {
        const targetId = localIds[0];
        const before = { ..._db[entityName][targetId] };
        let target = { ...before };
        for (const incomingId of incomingIds) {
          const incoming = records[incomingId];
          if (!incoming || typeof incoming !== "object") continue;
          // A fresh install auto-seeds a starter home board (marked
          // _seeded) whose row is NEWER by timestamp than the backup —
          // so the user's real imported board silently lost the fold
          // (tester: "import works except widget page"). An untouched
          // starter always yields to a real board.
          for (const f of ["ui_v2_home", "ui_v2_home_desktop"]) {
            const loc = target[f], inc = incoming[f];
            if (loc && typeof loc === "object" && loc._seeded && inc && typeof inc === "object" && !inc._seeded) {
              target[f] = inc;
            }
          }
          // v0.95.3: newer-wins fold (was blank-fill-only, which meant
          // settings changed on another device could NEVER arrive here —
          // system name/bio/terms edits silently lost on sync). The
          // singleton stays a single row; mergeExistingRecord keeps the
          // local value whenever it is the newer edit.
          target = mergeExistingRecord(target, incoming);
        }
        _db[entityName][targetId] = target;
        // The fold is invisible when it rejects real differences — surface
        // them in the same conflict review the regular merge gets. The
        // incoming copy is re-keyed to the singleton's LOCAL id so choosing
        // it overwrites the one row instead of minting a second singleton.
        const firstIncoming = records[incomingIds[0]];
        if (firstIncoming && recordsMateriallyDiffer(target, firstIncoming)) {
          conflicts.push({
            entity: entityName, id: targetId,
            local: target, incoming: { ...firstIncoming, id: targetId },
            kept: "local", reason: "edit",
          });
        }
        continue;
      }
      // No local record yet — fall through to the regular add path.
    }

    const keyFn = MERGE_CONTENT_KEYS[entityName];
    if (keyFn) {
      const localIds = Object.keys(_db[entityName]);
      if (localIds.length > 0) {
        const seen = new Set();
        for (const local of Object.values(_db[entityName])) {
          if (!local || typeof local !== "object") continue;
          const key = keyFn(local);
          if (key) seen.add(key);
        }
        for (const [id, record] of Object.entries(records)) {
          if (!record || typeof record !== "object") continue;
          if (_db[entityName][id]) {
            // Same id exists — update it in place (newer wins).
            noteEditConflict(entityName, id, _db[entityName][id], record);
            _db[entityName][id] = mergeExistingRecord(_db[entityName][id], record);
            continue;
          }
          const key = keyFn(record);
          if (key && seen.has(key)) continue;
          if (tombstoneBlocks(entityName, id, record)) {
            conflicts.push({ entity: entityName, id, local: null, incoming: { ...record }, kept: "deleted", reason: "deletion" });
            continue;
          }
          _db[entityName][id] = record;
          if (key) seen.add(key);
        }
        continue;
      }
      // No local rows yet — fall through to the regular add path.
    }

    for (const [id, record] of Object.entries(records)) {
      if (!_db[entityName][id]) {
        if (tombstoneBlocks(entityName, id, record)) {
          conflicts.push({ entity: entityName, id, local: null, incoming: { ...record }, kept: "deleted", reason: "deletion" });
          continue;
        }
        _db[entityName][id] = record;
      } else if (entityName !== "FrontingSession") {
        // Same id exists locally — merge instead of skipping, so edits
        // made on another device (new avatar, changed role/tags/bio)
        // actually arrive.
        noteEditConflict(entityName, id, _db[entityName][id], record);
        _db[entityName][id] = mergeExistingRecord(_db[entityName][id], record);
      } else if (_db[entityName][id].is_active !== true && record.is_active !== true) {
        // FrontingSession (v0.95.3): CLOSED sessions now merge newer-wins
        // so post-hoc edits (notes, per-member entries, trigger flags)
        // made on another device arrive. Live state stays protected:
        // any session that is active on EITHER side is left untouched
        // (the active-session sanitizer above already demoted incoming
        // actives when a local front is running).
        noteEditConflict(entityName, id, _db[entityName][id], record);
        _db[entityName][id] = mergeExistingRecord(_db[entityName][id], record);
      }
    }
  }

  // Deletion-sync: apply the OTHER device's tombstones. A local record is
  // removed only when the tombstone is NEWER than the record's last edit —
  // an edit made here after the other device's delete survives (and will
  // re-add the record over there on the return sync).
  if (applyDeletions && sanitized.DeletionLog) {
    for (const t of Object.values(sanitized.DeletionLog)) {
      if (!t || !t.entity || !t.record_id || TOMBSTONE_SKIP.has(t.entity)) continue;
      const col = _db[t.entity];
      const local = col?.[t.record_id];
      if (!local) continue;
      if (t.entity === "FrontingSession" && local.is_active === true) continue; // never delete live state
      const localTime = Date.parse(local.updated_date || local.created_date || "") || 0;
      if ((Date.parse(t.deleted_at || "") || 0) > localTime) {
        conflicts.push({ entity: t.entity, id: t.record_id, local: { ...local }, incoming: null, kept: "deleted", reason: "deletion" });
        delete col[t.record_id];
      }
    }
  }
  await saveDb();
  return { conflicts };
}

// Recursively dedupe string arrays that ended up holding `id` more than once
// after a reference rewrite (e.g. co_fronter_ids that contained both halves of
// a merged pair). Only removes EXTRA copies of that one id — everything else
// in the array is untouched.
function dedupeIdInArrays(value, id) {
  if (Array.isArray(value)) {
    const out = [];
    let seenId = false;
    for (const item of value) {
      if (item === id) {
        if (seenId) continue;
        seenId = true;
      }
      out.push(dedupeIdInArrays(item, id));
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = dedupeIdInArrays(v, id);
    return out;
  }
  return value;
}

// Rewrite every reference to `oldId` across the whole database to `newId` —
// the storage-layer half of "merge two records into one". Works by exact
// substring replacement on each record's JSON serialisation, which also
// reaches ids embedded inside JSON-stringified payload strings (e.g.
// FrontingSession.session_symptoms). Ids are UUIDs, so an exact match can't
// collide with ordinary text. Records are only rewritten, never deleted —
// deleting the merged-away record is the CALLER's explicit final step.
export async function replaceIdReferences(oldId, newId, { skipEntities = [] } = {}) {
  const db = getDb();
  if (!oldId || !newId || oldId === newId) return 0;
  let changed = 0;
  for (const [entityName, col] of Object.entries(db)) {
    if (skipEntities.includes(entityName) || isReservedDbKey(entityName)) continue;
    if (!col || typeof col !== "object") continue;
    for (const [rid, rec] of Object.entries(col)) {
      if (!rec || typeof rec !== "object") continue;
      const str = JSON.stringify(rec);
      if (!str.includes(oldId)) continue;
      const replaced = JSON.parse(str.split(oldId).join(newId));
      col[rid] = dedupeIdInArrays(replaced, newId);
      changed++;
    }
  }
  if (changed > 0) await saveDb();
  return changed;
}

async function walkAndMigrate(value, saveLocalImage, createLocalImageUrl, isLocalImageUrl) {
  if (typeof value === 'string') {
    if (value.startsWith('data:') && !isLocalImageUrl(value)) {
      const imageId = `migrated-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await saveLocalImage(imageId, value);
      return { changed: true, value: createLocalImageUrl(imageId) };
    }
    if (value.includes('src="data:image')) {
      let changed = false;
      let result = value;
      const matches = [...value.matchAll(/src="(data:image\/[^"]+)"/g)];
      for (const match of matches) {
        const dataUrl = match[1];
        const imageId = `migrated-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        const localUrl = createLocalImageUrl(imageId);
        result = result.replace(match[0], `src="${localUrl}"`);
        changed = true;
      }
      return { changed, value: result };
    }
    return { changed: false, value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const result = [];
    for (const item of value) {
      const r = await walkAndMigrate(item, saveLocalImage, createLocalImageUrl, isLocalImageUrl);
      if (r.changed) changed = true;
      result.push(r.value);
    }
    return { changed, value: result };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      const r = await walkAndMigrate(v, saveLocalImage, createLocalImageUrl, isLocalImageUrl);
      if (r.changed) changed = true;
      result[k] = r.value;
    }
    return { changed, value: result };
  }
  return { changed: false, value };
}

export async function migrateBase64AvatarsToLocal() {
  const db = getDb();
  const { saveLocalImage, createLocalImageUrl, isLocalImageUrl } = await import('./localImageStorage.js');

  let migrated = 0;
  for (const [entityName, collection] of Object.entries(db)) {
    if (isReservedDbKey(entityName)) continue;
    if (!collection || typeof collection !== 'object') continue;
    for (const [recordId, record] of Object.entries(collection)) {
      if (!record || typeof record !== 'object') continue;
      let recordChanged = false;
      const updatedRecord = { ...record };
      for (const [field, value] of Object.entries(record)) {
        if (['id', 'created_date', 'updated_date', 'created_by'].includes(field)) continue;
        try {
          const r = await walkAndMigrate(value, saveLocalImage, createLocalImageUrl, isLocalImageUrl);
          if (r.changed) {
            updatedRecord[field] = r.value;
            recordChanged = true;
            migrated++;
          }
        } catch (e) {
          console.warn(`[migrateBase64AvatarsToLocal] Failed on ${entityName}.${recordId}.${field}:`, e);
        }
      }
      if (recordChanged) {
        db[entityName][recordId] = updatedRecord;
      }
    }
  }
  if (migrated > 0) await saveDb();
  return migrated;
}

// Expose raw IndexedDB dump for the debug panel
export async function getRawIdbDump() {
  return getDb();
}

// Fetch external https:// image URLs, store them in IDB, and rewrite the DB record.
// Requires network. Skips URLs that aren't images (wrong Content-Type) or fail to fetch.
// onProgress({ migrated, failed, skipped }) is called after each URL attempt.
export async function migrateHttpImagesToLocal(onProgress) {
  const db = getDb();
  const { saveLocalImage, createLocalImageUrl, isLocalImageUrl } = await import('./localImageStorage.js');

  let migrated = 0;
  let failed = 0;
  let skipped = 0;

  const report = (type) => {
    if (type === 'migrated') migrated++;
    else if (type === 'failed') failed++;
    else skipped++;
    onProgress?.({ migrated, failed, skipped });
  };

  for (const [entityName, collection] of Object.entries(db)) {
    if (isReservedDbKey(entityName)) continue;
    if (!collection || typeof collection !== 'object') continue;
    for (const [recordId, record] of Object.entries(collection)) {
      if (!record || typeof record !== 'object') continue;
      let recordChanged = false;
      const updatedRecord = { ...record };
      for (const [field, value] of Object.entries(record)) {
        if (['id', 'created_date', 'updated_date', 'created_by'].includes(field)) continue;
        try {
          const r = await _walkAndMigrateHttp(value, saveLocalImage, createLocalImageUrl, isLocalImageUrl, report);
          if (r.changed) {
            updatedRecord[field] = r.value;
            recordChanged = true;
          }
        } catch {}
      }
      if (recordChanged) db[entityName][recordId] = updatedRecord;
    }
  }

  if (migrated > 0) await saveDb();
  return { migrated, failed, skipped };
}

async function _walkAndMigrateHttp(value, saveLocalImage, createLocalImageUrl, isLocalImageUrl, onResult) {
  if (typeof value === 'string') {
    if (isLocalImageUrl(value) || value.startsWith('data:') || value.startsWith('local-image://')) {
      return { changed: false, value };
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        // fetchRemoteImageAsDataUrl tries native HTTP first (bypasses WebView
        // CORS — needed for CDNs like Simply Plural's that a plain fetch can't
        // reach on the app), then falls back to a CORS fetch. null → couldn't
        // be fetched or isn't an image.
        const { fetchRemoteImageAsDataUrl, compressImageDataUrl } = await import('./localImageStorage.js');
        let dataUrl = await fetchRemoteImageAsDataUrl(value);
        if (!dataUrl) { onResult('failed'); return { changed: false, value }; }
        dataUrl = await compressImageDataUrl(dataUrl);
        const imageId = `cached-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        onResult('migrated');
        return { changed: true, value: createLocalImageUrl(imageId) };
      } catch {
        onResult('failed');
        return { changed: false, value };
      }
    }
    return { changed: false, value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const result = [];
    for (const item of value) {
      const r = await _walkAndMigrateHttp(item, saveLocalImage, createLocalImageUrl, isLocalImageUrl, onResult);
      if (r.changed) changed = true;
      result.push(r.value);
    }
    return { changed, value: result };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      const r = await _walkAndMigrateHttp(v, saveLocalImage, createLocalImageUrl, isLocalImageUrl, onResult);
      if (r.changed) changed = true;
      result[k] = r.value;
    }
    return { changed, value: result };
  }
  return { changed: false, value };
}
