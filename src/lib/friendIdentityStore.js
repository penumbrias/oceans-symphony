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
//
// SEALED AT REST (v0.182.0). The identity holds the relay `secret` and the
// E2E `privateKeyJwk` — the two things that let a device impersonate this
// user to the relay and decrypt every member-list envelope held for them.
// They used to sit in plaintext localStorage/IDB even when the user had
// turned app encryption ON, defeating the reasonable expectation that a
// locked app yields nothing. Now: when app encryption is active, the
// stored identity is an envelope { __sealed: 1, payload } encrypted with
// the SAME app key (one password for the whole app, every system's blob
// shares the salt — so it opens from any system after unlock). When
// encryption is off, it is stored plain as before (there is nothing
// stronger to wrap with; the data blob itself is plain then).
//
// The principle (user's words): "none of your data is STORED on servers" —
// Friends/push legitimately CONTACT a server; what matters is that nothing
// on-device leaks the keys that talk to it. Background sync keeps its own
// minimal (userId, secret) copy in the OS-private KV — that store is now
// excluded from cloud backup (0.180.0) and never holds the private key.
//
// Transitions: enableEncryption/disableEncryption call resealSharedFriendIdentity()
// so the on-disk form always matches the current mode.

import { openDB } from 'idb';
import { isEncryptionActive, encryptWithActiveKey, decryptWithActiveKey } from '@/lib/localDb';

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

async function readRaw() {
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

async function writeRaw(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch { /* quota/disabled */ }
  try { const idb = await getIdb(); await idb.put(IDB_STORE, obj, KEY); } catch { /* mirror still holds it */ }
}

async function seal(obj) {
  if (!isEncryptionActive()) return obj;
  try { return { __sealed: 1, payload: await encryptWithActiveKey(obj) }; }
  catch (e) {
    // Never lose the identity over a seal failure — but never hide it either.
    console.warn("[friendIdentityStore] seal failed; storing plain", e);
    return obj;
  }
}

async function unseal(stored) {
  if (!stored || typeof stored !== 'object' || !stored.__sealed) return stored;
  if (!isEncryptionActive()) return null; // locked / encryption off: unreadable right now
  try { return await decryptWithActiveKey(stored.payload); } catch { return null; }
}

export async function getSharedFriendIdentity() {
  const stored = await readRaw();
  const id = await unseal(stored);
  // Opportunistic upgrade: a plain identity found while encryption is on
  // gets sealed on the next read, so existing installs converge without a
  // migration step.
  if (id && stored && !stored.__sealed && isEncryptionActive()) {
    try { await writeRaw(await seal(id)); } catch { /* next read */ }
  }
  return id;
}

export async function setSharedFriendIdentity(obj) {
  if (!obj) return;
  await writeRaw(await seal(obj));
}

// Called by enableEncryption / disableEncryption AFTER the key state has
// changed, so the stored form follows the mode: plain→sealed when turning
// on; sealed→plain when turning off (the caller passes the OLD key's
// decryptor via `readWith` when the active key is already gone).
export async function resealSharedFriendIdentity({ readWith, plain = false } = {}) {
  try {
    const stored = await readRaw();
    if (!stored) return;
    let id;
    if (stored.__sealed) {
      id = readWith ? await readWith(stored.payload) : await unseal(stored);
    } else {
      id = stored;
    }
    if (!id) return; // couldn't open — leave as-is rather than clobber
    // `plain` = encryption is being turned OFF (the caller still holds the
    // old key for reading, but the result must be stored unsealed).
    await writeRaw(plain ? id : await seal(id));
  } catch { /* best-effort */ }
}

export async function clearSharedFriendIdentity() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { const idb = await getIdb(); await idb.delete(IDB_STORE, KEY); } catch { /* ignore */ }
}
