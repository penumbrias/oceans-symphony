// Local-first database backed by IndexedDB (via idb).
// Provides the same API as base44.entities so all existing code works without changes.
// Falls back to migrating existing localStorage data on first run.

import { openDB } from 'idb';
import { encryptData, decryptData, generateSalt, deriveKey } from './localEncryption';
import { isEncryptionEnabled, getEncSalt, setEncSalt } from './storageMode';

const IDB_NAME = 'oceans_symphony';
const IDB_VERSION = 1;
const IDB_STORE = 'keyval';
const STORAGE_KEY = 'symphony_local_data';
const FAKE_USER_EMAIL = 'local@symphony.app';

let _db = null;       // in-memory: { EntityName: { id: record } }
let _encKey = null;   // CryptoKey when encryption is active
let _idbPromise = null;

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

async function loadFromStorage() {
  try {
    const idb = await getIdb();
    const value = await idb.get(IDB_STORE, STORAGE_KEY);
    if (value !== undefined) return value;
    // One-time migration from localStorage to IndexedDB
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      await idb.put(IDB_STORE, legacy, STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
      return legacy;
    }
    return null;
  } catch {
    return localStorage.getItem(STORAGE_KEY);
  }
}

async function saveToStorage(value) {
  try {
    const idb = await getIdb();
    await idb.put(IDB_STORE, value, STORAGE_KEY);
  } catch {
    localStorage.setItem(STORAGE_KEY, value);
  }
}

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getDb() {
  if (_db !== null) return _db;
  // Synchronous fallback (only safe after initLocalDb has run)
  _db = {};
  return _db;
}

async function saveDb() {
  const json = _encKey
    ? JSON.stringify({ __encrypted: await encryptData(_db, _encKey) })
    : JSON.stringify(_db);
  await saveToStorage(json);
}

// Called on app start. Password required only when encryption is enabled.
export async function initLocalDb(password) {
  if (password && isEncryptionEnabled()) {
    let salt = getEncSalt();
    if (!salt) {
      salt = await generateSalt();
      setEncSalt(salt);
    }
    _encKey = await deriveKey(password, salt);
    const raw = await loadFromStorage();
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.__encrypted) {
        try {
          _db = await decryptData(parsed.__encrypted, _encKey);
        } catch {
          _encKey = null;
          throw new Error('Incorrect password');
        }
      } else {
        _db = parsed;
      }
    } else {
      _db = {};
    }
  } else {
    _encKey = null;
    const raw = await loadFromStorage();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        _db = (parsed && parsed.__encrypted) ? {} : parsed;
      } catch {
        _db = {};
      }
    } else {
      _db = {};
    }
  }
}

export async function enableEncryption(password) {
  const db = getDb();
  let salt = getEncSalt();
  if (!salt) { salt = await generateSalt(); setEncSalt(salt); }
  _encKey = await deriveKey(password, salt);
  _db = db;
  await saveDb();
}

export async function disableEncryption(password) {
  await initLocalDb(password);
  _encKey = null;
  await saveDb();
}

export const isDbInitialized = () => _db !== null;
export const clearSession = () => { _db = null; _encKey = null; };

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

export async function loadDbDump(dump) {
  _db = dump;
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
