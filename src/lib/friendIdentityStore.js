// App-level shared Friends identity (P4 — multiple systems).
//
// Kane's decision: ONE Friends identity shared across all systems (per-alter
// privacy levels decide what each friend sees, per system). The FriendIdentity
// entity itself lives in each system's data blob, but that would give every
// system its own identity. So this app-level store holds the single shared
// identity (device-bound, like the systems registry) and is the source of
// truth: friendsApi.syncSharedFriendIdentity() pulls it into the active system
// on each load, and mirrors changes back here.
//
// Stored with the same dual-store resilience as the registry (IndexedDB primary
// + localStorage mirror). Device-bound: NEVER included in backups.

import { openDB } from 'idb';

const IDB_NAME = 'oceans_symphony';
const IDB_STORE = 'keyval';
const KEY = 'symphony_shared_friend_identity_v1';

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

export async function getSharedFriendIdentity() {
  try {
    const idb = await getIdb();
    const v = await idb.get(IDB_STORE, KEY);
    if (v) return typeof v === 'string' ? JSON.parse(v) : v;
  } catch { /* fall through to mirror */ }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function setSharedFriendIdentity(obj) {
  if (!obj) return;
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch { /* quota/disabled */ }
  try { const idb = await getIdb(); await idb.put(IDB_STORE, obj, KEY); } catch { /* mirror still holds it */ }
}

export async function clearSharedFriendIdentity() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { const idb = await getIdb(); await idb.delete(IDB_STORE, KEY); } catch { /* ignore */ }
}
