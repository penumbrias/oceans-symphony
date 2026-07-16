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
// This runs ONLY in the `!peek.exists` boot branch (active slot empty), so it
// can never divert a user whose data is loading normally, and it returns an
// empty list for a genuinely-new user (no blob keys), leaving firstrun intact.

import { openDB } from 'idb';
import { getActiveStorageKey } from './localDb';
import { LEGACY_STORAGE_KEY } from './systems';
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
    _idbPromise = openDB(IDB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      },
    });
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

// Scan the whole IndexedDB scope for data blobs that are NOT the (empty) active
// slot. Returns a list of candidates sorted richest-first:
//   { key, systemId, encrypted, entityCount, alterCount, sizeBytes, name, raw }
// - `encrypted` candidates can't be counted without the password, so their
//   entityCount/alterCount are null; they're still offered (a locked blob is
//   still the user's data).
// - `raw` is the on-disk string, handed back so the recovery screen can offer a
//   "download a copy first" button without a second read.
// Never throws for a per-key parse failure — a corrupted key is simply skipped.
export async function scanForOrphanedData() {
  const activeKey = getActiveStorageKey();
  let keys = [];
  let store = null;
  try {
    const idb = await getIdb();
    const tx = idb.transaction(IDB_STORE, 'readonly');
    store = tx.objectStore(IDB_STORE);
    keys = await store.getAllKeys();
  } catch {
    return []; // storage unreadable — App.jsx's own peek already routes to recovery
  }

  const candidates = [];
  for (const key of keys) {
    if (!isDataBlobKey(key)) continue;
    if (key === activeKey) continue; // the empty slot that sent us here
    let raw;
    try {
      const idb = await getIdb();
      raw = await idb.get(IDB_STORE, key);
    } catch { continue; }
    if (raw == null) continue;
    const rawStr = typeof raw === 'string' ? raw : (() => { try { return JSON.stringify(raw); } catch { return ''; } })();
    if (!rawStr) continue;

    let parsed;
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { continue; } // unparseable — not a clean candidate

    if (parsed && typeof parsed === 'object' && parsed.__encrypted) {
      candidates.push({
        key,
        systemId: systemIdFromKey(key),
        encrypted: true,
        entityCount: null,
        alterCount: null,
        sizeBytes: rawStr.length,
        name: null,
        raw: rawStr,
      });
      continue;
    }

    const { entityCount, alterCount, name } = summarizePlainData(parsed);
    if (entityCount <= 0) continue; // empty object — nothing to recover
    candidates.push({
      key,
      systemId: systemIdFromKey(key),
      encrypted: false,
      entityCount,
      alterCount,
      sizeBytes: rawStr.length,
      name,
      raw: rawStr,
    });
  }

  // Richest first: real record counts beat encrypted-unknown, then by size.
  candidates.sort((a, b) => {
    const ae = a.entityCount ?? -1;
    const be = b.entityCount ?? -1;
    if (be !== ae) return be - ae;
    return b.sizeBytes - a.sizeBytes;
  });
  return candidates;
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
  let keys = [];
  try {
    const idb = await getIdb();
    keys = await idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAllKeys();
  } catch {
    return [];
  }

  const blobs = [];
  for (const key of keys) {
    if (!isDataBlobKey(key)) continue;
    let raw;
    try {
      const idb = await getIdb();
      raw = await idb.get(IDB_STORE, key);
    } catch { continue; }
    if (raw == null) continue;
    const rawStr = typeof raw === 'string' ? raw : (() => { try { return JSON.stringify(raw); } catch { return ''; } })();
    if (!rawStr) continue;

    let parsed;
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch {
      blobs.push({ key, systemId: systemIdFromKey(key), isActive: key === activeKey, encrypted: false, corrupted: true, entityCount: null, alterCount: null, sizeBytes: rawStr.length, name: null, raw: rawStr });
      continue;
    }

    if (parsed && typeof parsed === 'object' && parsed.__encrypted) {
      blobs.push({ key, systemId: systemIdFromKey(key), isActive: key === activeKey, encrypted: true, entityCount: null, alterCount: null, sizeBytes: rawStr.length, name: null, raw: rawStr });
      continue;
    }

    const { entityCount, alterCount, name } = summarizePlainData(parsed);
    blobs.push({ key, systemId: systemIdFromKey(key), isActive: key === activeKey, encrypted: false, entityCount, alterCount, sizeBytes: rawStr.length, name, raw: rawStr });
  }

  // Active first, then richest — so the user sees "the one you're in" up top,
  // then any other copies ranked by how much data they hold.
  blobs.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (b.entityCount ?? -1) - (a.entityCount ?? -1);
  });
  return blobs;
}
