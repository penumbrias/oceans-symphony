// Local-first database backed by localStorage.
// Provides the same API as base44.entities so all existing code works without changes.

import { encryptData, decryptData, generateSalt, deriveKey } from './localEncryption';
import { isEncryptionEnabled, getEncSalt, setEncSalt } from './storageMode';

const STORAGE_KEY = 'symphony_local_data';
const FAKE_USER_EMAIL = 'local@symphony.app';

let _db = null;       // in-memory: { EntityName: { id: record } }
let _encKey = null;   // CryptoKey when encryption is active

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getDb() {
  if (_db !== null) return _db;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // If data is encrypted and we haven't unlocked yet, return empty (safe fallback)
      if (parsed && parsed.__encrypted) { _db = {}; return _db; }
      _db = parsed;
    } else {
      _db = {};
    }
  } catch {
    _db = {};
  }
  return _db;
}

async function saveDb() {
  if (_encKey) {
    const encrypted = await encryptData(_db, _encKey);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ __encrypted: encrypted }));
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_db));
  }
}

// Called on app start. Password is required only if encryption is enabled.
export async function initLocalDb(password) {
  if (password && isEncryptionEnabled()) {
    let salt = getEncSalt();
    if (!salt) {
      salt = await generateSalt();
      setEncSalt(salt);
    }
    _encKey = await deriveKey(password, salt);
    const raw = localStorage.getItem(STORAGE_KEY);
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
        // Unencrypted data exists — load it (may be migrating to encrypted)
        _db = parsed;
      }
    } else {
      _db = {};
    }
  } else {
    _encKey = null;
    getDb();
  }
}

// Enable encryption for the first time (encrypts existing data with password)
export async function enableEncryption(password) {
  const db = getDb();
  let salt = getEncSalt();
  if (!salt) { salt = await generateSalt(); setEncSalt(salt); }
  _encKey = await deriveKey(password, salt);
  _db = db;
  await saveDb();
}

// Disable encryption (re-saves as plaintext)
export async function disableEncryption(password) {
  // Verify password first
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

// Simple pub/sub for subscribe() support
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
          return () => { _listeners[entityName] = (_listeners[entityName] || []).filter(fn => fn !== callback); };
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

// Full data dump for export
export function getFullDbDump() {
  const db = getDb();
  return { ...db };
}

// Load a full dump (for import/restore)
export async function loadDbDump(dump) {
  _db = dump;
  await saveDb();
}

// Migrate ALL base64 data URLs in any entity field to local image storage
export async function migrateBase64AvatarsToLocal() {
  const db = getDb();
  const { saveLocalImage, createLocalImageUrl, isLocalImageUrl } = await import('./localImageStorage.js');

  let migrated = 0;

  for (const [entityName, collection] of Object.entries(db)) {
    if (!collection || typeof collection !== 'object') continue;
    for (const [recordId, record] of Object.entries(collection)) {
      if (!record || typeof record !== 'object') continue;
      let changed = false;
      for (const [field, value] of Object.entries(record)) {
        if (typeof value === 'string' && value.startsWith('data:') && !isLocalImageUrl(value)) {
          const imageId = `migrated-${entityName}-${recordId}-${field}`;
          try {
            await saveLocalImage(imageId, value);
            db[entityName][recordId][field] = createLocalImageUrl(imageId);
            changed = true;
            migrated++;
          } catch (e) {
            console.warn(`Failed to migrate ${entityName}.${recordId}.${field}:`, e);
          }
        }
      }
    }
  }

  if (migrated > 0) {
    await saveDb();
    console.log(`Migrated ${migrated} base64 image(s) to local image storage`);
  }
  return migrated;
}