// Local-first database backed by IndexedDB (via idb).
// Provides the same API as base44.entities so all existing code works without changes.
// Falls back to migrating existing localStorage data on first run.

import { openDB } from 'idb';
import { encryptData, decryptData, generateSalt, deriveKey } from './localEncryption';
import { getEncSalt, setEncSalt, setEncryptionEnabled } from './storageMode';

const IDB_NAME = 'oceans_symphony';
const IDB_VERSION = 1;
const IDB_STORE = 'keyval';
const STORAGE_KEY = 'symphony_local_data';
const FAKE_USER_EMAIL = 'local@symphony.app';

let _db = null;       // in-memory: { EntityName: { id: record } }
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
async function loadFromStorage() {
  let idbValue = undefined;
  let idbError = null;
  try {
    const idb = await getIdb();
    idbValue = await idb.get(IDB_STORE, STORAGE_KEY);
  } catch (e) {
    idbError = e;
  }
  if (idbValue !== undefined) return idbValue;

  // One-time migration from localStorage to IndexedDB (if IDB is healthy).
  const legacy = localStorage.getItem(STORAGE_KEY);
  if (legacy) {
    if (!idbError) {
      try {
        const idb = await getIdb();
        await idb.put(IDB_STORE, legacy, STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY);
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
    await idb.put(IDB_STORE, value, STORAGE_KEY);
  } catch {
    localStorage.setItem(STORAGE_KEY, value);
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
  try {
    const key = await deriveKey(password, salt);
    await decryptData(parsed.__encrypted, key);
    return true;
  } catch {
    return false;
  }
}

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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

async function saveDb() {
  // Preview-mode writes stay purely in memory and never reach IndexedDB.
  if (_previewDb !== null) return;
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
    });
  } else {
    json = JSON.stringify(_db);
  }
  await saveToStorage(json);
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
export async function initLocalDb(password) {
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
      _encKey = await deriveKey(password, salt);
      setEncryptionEnabled(true);
    } else {
      _activeSalt = null;
      _encKey = null;
    }
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
    const key = await deriveKey(password, salt);
    let decrypted;
    try {
      decrypted = await decryptData(parsed.__encrypted, key);
    } catch {
      _encKey = null;
      _db = null;
      throw new Error('Incorrect password');
    }
    _encKey = key;
    _db = decrypted;
    return;
  }

  // Plain (unencrypted) data. Load it as-is. If the user supplied a
  // password but the stored data isn't encrypted, ignore the password —
  // they can flip encryption on later via Settings.
  _encKey = null;
  _activeSalt = null;
  _db = parsed;
}

export async function enableEncryption(password) {
  const db = getDb();
  let salt = getEncSalt();
  if (!salt) { salt = await generateSalt(); setEncSalt(salt); }
  _activeSalt = salt;
  _encKey = await deriveKey(password, salt);
  setEncryptionEnabled(true);
  _db = db;
  await saveDb();
}

export async function disableEncryption(password) {
  await initLocalDb(password);
  _encKey = null;
  _activeSalt = null;
  setEncryptionEnabled(false);
  await saveDb();
}

export const isDbInitialized = () => _db !== null;
export const clearSession = () => { _db = null; _encKey = null; _activeSalt = null; };

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
          return created;
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

export async function loadDbDump(dump) {
  _db = dump;
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
    await idb.delete(IDB_STORE, STORAGE_KEY);
  } catch { /* fall through to localStorage cleanup */ }
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
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

export async function mergeDbDump(dump) {
  if (!_db) _db = {};
  for (const [entityName, records] of Object.entries(dump)) {
    if (!records || typeof records !== "object") continue;
    if (!_db[entityName]) _db[entityName] = {};

    if (entityName === "SystemSettings") {
      const localIds = Object.keys(_db[entityName]);
      const incomingIds = Object.keys(records);
      // If a local SystemSettings record already exists, fold the
      // incoming row(s) into it field-by-field rather than adding a
      // second record alongside.
      if (localIds.length > 0 && incomingIds.length > 0) {
        const targetId = localIds[0];
        const target = { ..._db[entityName][targetId] };
        for (const incomingId of incomingIds) {
          const incoming = records[incomingId];
          if (!incoming || typeof incoming !== "object") continue;
          for (const [field, value] of Object.entries(incoming)) {
            if (field === "id" || field === "created_date" || field === "updated_date") continue;
            if (isEmptyValue(target[field]) && !isEmptyValue(value)) {
              target[field] = value;
            }
          }
        }
        _db[entityName][targetId] = target;
        continue;
      }
      // No local record yet — fall through to the regular add path.
    }

    if (entityName === "DailyTaskTemplate") {
      // The default daily-task templates auto-seed (with fresh random ids)
      // the first time the Daily Tasks page is opened on an empty DB. A
      // backup made after the original seed carries the SAME defaults
      // under different ids, so the plain "skip if id exists" merge below
      // would let both sets coexist — visible to the user as every preset
      // task appearing twice. Dedupe by (title, frequency) when local
      // templates already exist; local row wins so user tweaks (custom
      // triggers, sort_order, is_active toggles) survive the import.
      const localIds = Object.keys(_db[entityName]);
      if (localIds.length > 0) {
        const seen = new Set();
        for (const local of Object.values(_db[entityName])) {
          if (!local || typeof local !== "object") continue;
          const title = String(local.title || "").trim().toLowerCase();
          if (!title) continue;
          const freq = local.frequency || "daily";
          seen.add(`${title}::${freq}`);
        }
        for (const [id, record] of Object.entries(records)) {
          if (!record || typeof record !== "object") continue;
          if (_db[entityName][id]) continue;
          const title = String(record.title || "").trim().toLowerCase();
          const freq = record.frequency || "daily";
          const key = title ? `${title}::${freq}` : null;
          if (key && seen.has(key)) continue;
          _db[entityName][id] = record;
          if (key) seen.add(key);
        }
        continue;
      }
      // No local templates yet — fall through to the regular add path.
    }

    for (const [id, record] of Object.entries(records)) {
      if (!_db[entityName][id]) {
        _db[entityName][id] = record;
      }
    }
  }
  await saveDb();
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
        const response = await fetch(value, { mode: 'cors' });
        if (!response.ok) { onResult('failed'); return { changed: false, value }; }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          onResult('skipped');
          return { changed: false, value };
        }
        const blob = await response.blob();
        let dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const { compressImageDataUrl } = await import('./localImageStorage.js');
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
