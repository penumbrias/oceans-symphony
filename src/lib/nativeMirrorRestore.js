// Boot-time restore + background upkeep for the native private-file mirror
// (see nativeMirror.js for what is mirrored and why).
//
// restoreFromMirrorIfWiped() runs at boot BEFORE the systems registry or
// any data is read. It only ever writes into an EMPTY web view store: when
// IndexedDB holds no data blob at all but the private files do, the web
// view storage was wiped while the app was closed — put the files back.
// Any partial case (some blobs present) is left to the recovery screen,
// which lists the file copies next to everything else; nothing here ever
// overwrites a blob that exists.
//
// It also appends a boot record to native Preferences (SharedPreferences /
// UserDefaults — outside web view storage), so the next "everything is
// gone" report can be read back and tell a wiped web view apart from an
// app bug.

import { openDB } from "idb";
import { isNative } from "@/lib/platform";
import { APP_VERSION } from "@/lib/appVersion";
import {
  listMirroredDbKeys, readBestDbMirror, readRegistryMirror, isMirrorableBlob,
  mirrorDbBlob, mirrorRegistry, hookMirrorLifecycle, listMediaMirror, readMediaMirror, mirrorMedia,
} from "@/lib/nativeMirror";

const IDB_NAME = "oceans_symphony";
const IDB_STORE = "keyval";
const REGISTRY_KEY = "symphony_systems_registry";
const LEGACY_KEY = "symphony_local_data";
const BOOT_LOG_KEY = "symphony_boot_log_v1";
const BOOT_LOG_MAX = 30;
export const RESTORED_NOTICE_KEY = "symphony_restored_from_app_files_v1";

const isDataBlobKey = (k) => typeof k === "string" && (k === LEGACY_KEY || k.startsWith(`${LEGACY_KEY}__`));
const openStore = () => openDB(IDB_NAME, 1, {
  upgrade(db) { if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); },
});
const asString = (v) => (typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return null; } })());

// NEVER return a Capacitor plugin object from an async function (or resolve
// a promise with one): the promise machinery looks for `.then` on it, the
// plugin proxy answers with a native call ("Preferences.then() is not
// implemented"), and the promise never settles. That hung boot forever in
// 0.247.0 ("Taking longer than usual to load"). Wrap it instead.
async function prefs() {
  try { const { Preferences } = await import("@capacitor/preferences"); return { Preferences }; } catch { return null; }
}

async function appendBootRecord(rec) {
  const P = await prefs();
  if (!P) return;
  try {
    const { value } = await P.Preferences.get({ key: BOOT_LOG_KEY });
    let list = [];
    try { list = JSON.parse(value || "[]"); } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    list.push(rec);
    await P.Preferences.set({ key: BOOT_LOG_KEY, value: JSON.stringify(list.slice(-BOOT_LOG_MAX)) });
  } catch { /* diagnostics only */ }
}

export async function readBootRecords() {
  if (!isNative()) return [];
  const P = await prefs();
  if (!P) return [];
  try {
    const { value } = await P.Preferences.get({ key: BOOT_LOG_KEY });
    const list = JSON.parse(value || "[]");
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export async function restoreFromMirrorIfWiped() {
  if (!isNative()) return null;
  const rec = { at: new Date().toISOString(), version: APP_VERSION, restored: [] };
  try {
    let lsCount = null;
    try { lsCount = localStorage.length; } catch { /* unavailable */ }
    rec.localStorageKeys = lsCount;
    const mirrorKeys = await listMirroredDbKeys();
    rec.mirrorKeys = mirrorKeys.length;
    let idb;
    try { idb = await openStore(); }
    catch (e) { rec.idbError = String(e?.message || e); await appendBootRecord(rec); return rec; }
    const keys = await idb.getAllKeys(IDB_STORE);
    const blobKeys = keys.filter(isDataBlobKey);
    rec.idbBlobs = blobKeys.length;
    rec.hasRegistry = keys.includes(REGISTRY_KEY);

    if (mirrorKeys.length > 0 && blobKeys.length === 0) {
      rec.wipeDetected = true;
      for (const key of mirrorKeys) {
        // A localStorage copy of this blob (IDB-write fallback) is handled
        // by the normal read path — never compete with it.
        try { if (localStorage.getItem(key)) continue; } catch { /* no LS */ }
        const best = await readBestDbMirror(key);
        if (!best || !isMirrorableBlob(best.raw)) continue;
        if ((await idb.get(IDB_STORE, key)) !== undefined) continue; // never overwrite
        await idb.put(IDB_STORE, best.raw, key);
        rec.restored.push(key);
      }
      if (rec.restored.length) {
        try { localStorage.setItem(RESTORED_NOTICE_KEY, JSON.stringify({ at: rec.at, count: rec.restored.length })); } catch { /* ok */ }
      }
    }
    // Registry gone from BOTH its homes (IDB + the localStorage copy): the
    // boot would otherwise write a fresh one-system registry and every
    // other system would drop off the list. Put the mirrored one back.
    if (!rec.hasRegistry) {
      let lsHasRegistry = false;
      try { lsHasRegistry = !!localStorage.getItem(REGISTRY_KEY); } catch { /* no LS */ }
      const reg = lsHasRegistry ? null : await readRegistryMirror();
      if (reg && Array.isArray(reg.systems) && reg.systems.length > 0
          && (await idb.get(IDB_STORE, REGISTRY_KEY)) === undefined) {
        await idb.put(IDB_STORE, reg, REGISTRY_KEY);
        rec.registryRestored = true;
      }
    }
  } catch (e) {
    rec.error = String(e?.message || e);
  }
  await appendBootRecord(rec);
  return rec;
}

// Background upkeep once the app is up: make sure every blob, the registry,
// and every picture / font has a private-file copy (this is also how
// existing users get their first copy), and put back any picture / font
// the web view lost. Runs once per launch; never throws.
let _maintained = false;
export async function runMirrorMaintenance() {
  if (!isNative() || _maintained) return;
  _maintained = true;
  hookMirrorLifecycle();
  try {
    const idb = await openStore();
    const keys = await idb.getAllKeys(IDB_STORE);
    for (const key of keys.filter(isDataBlobKey)) {
      const raw = asString(await idb.get(IDB_STORE, key));
      if (!isMirrorableBlob(raw)) continue;
      const best = await readBestDbMirror(key);
      if (!best || best.raw !== raw) mirrorDbBlob(key, raw);
    }
    const reg = await idb.get(IDB_STORE, REGISTRY_KEY);
    if (reg) {
      const cur = await readRegistryMirror();
      if (JSON.stringify(cur) !== JSON.stringify(reg)) await mirrorRegistry(reg);
    }
  } catch (e) { console.warn("[nativeMirror] blob upkeep failed", e); }

  await syncMedia("img");
  await syncMedia("font");
}

async function syncMedia(kind) {
  try {
    const store = kind === "img" ? await import("@/lib/localImageStorage") : await import("@/lib/localFontStorage");
    const onDevice = new Set(kind === "img" ? await store.listLocalImageIds() : await store.listLocalFontIds());
    const inFiles = new Set(await listMediaMirror(kind));
    // Put back anything the web view lost.
    for (const id of inFiles) {
      if (onDevice.has(id)) continue;
      const data = await readMediaMirror(kind, id);
      if (!data) continue;
      try {
        if (kind === "img") await store.saveLocalImage(id, data, undefined, { mirror: false });
        else await store.saveLocalFont(id, data, { mirror: false });
      } catch (e) { console.warn(`[nativeMirror] restore ${kind} ${id} failed`, e); }
    }
    // Give everything else its first private-file copy.
    for (const id of onDevice) {
      if (inFiles.has(id)) continue;
      const data = kind === "img" ? await store.getLocalImageAsDataUrl(id) : await store.getLocalFont(id);
      if (typeof data === "string") await mirrorMedia(kind, id, data);
    }
  } catch (e) { console.warn(`[nativeMirror] ${kind} upkeep failed`, e); }
}
