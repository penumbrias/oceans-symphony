// Native private-file mirror (v0.244.0) — a second, durable home for every
// user's data on the installed apps (Android / iOS).
//
// WHY: until now all data lived ONLY in the web view's storage (IndexedDB),
// which the browser engine manages and can clear without warning. The top
// user report — "I woke up and all my data was gone", no cleaner app — is
// that storage vanishing while the app was closed. The app's own private
// files (Directory.Library: Android `filesDir`, iOS `Library/`) are not
// part of web view storage; only uninstalling or "Clear storage" in the
// OS settings removes them, and neither is visible in a Files app.
//
// WHAT IS MIRRORED:
//   db/<key>.{a,b}.json      every system's database blob, exactly as stored
//                            (encrypted envelope stays encrypted)
//   db/<key>.kept-<ts>.json  a copy kept whenever a blob suddenly shrinks by
//                            half or more — never auto-deleted
//   registry.{a,b}.json      the systems registry
//   img/<id>.json, font/<id>.json   uploaded pictures and fonts
//
// CRASH SAFETY: the plugin's rename isn't guaranteed to overwrite
// atomically, so blobs use two alternating slots. Each file starts with a
// one-line header (seq + body length); a torn write fails the length check
// and the other slot — the previous complete copy — is used instead.
//
// RULES (see CLAUDE.md "Native private-file mirror"):
//   - Everything here is a no-op off native, and never throws into callers.
//   - Only deliberate user wipes ("Delete all local data", deleting a
//     system) delete mirror files. Nothing else ever removes a copy.
//   - A value that isn't a JSON object ("null", empty) is never mirrored.

import { isNative, hasPrivateFileCopy } from "@/lib/platform";

const ROOT = "symphony-safe";
const DEBOUNCE_MS = 2000;
const SHRINK_RATIO = 0.5;      // new blob < half the last one → keep a copy
const SHRINK_MIN_BYTES = 4096; // ...when the last one was worth keeping

// The desktop app's file bridge (electron/preload.cjs `safe`), shaped like
// the Capacitor Filesystem calls this module makes. Paths arrive as
// "symphony-safe/…"; main confines them to <userData>/symphony-safe.
function desktopFs() {
  const safe = globalThis.symphonyDesktop?.safe;
  const must = (r, what) => { if (!r?.ok) throw new Error(r?.error || `${what} failed`); return r; };
  return {
    dir: null,
    utf8: null,
    Filesystem: {
      readFile: async ({ path }) => ({ data: must(await safe.read(path), "read").data }),
      writeFile: async ({ path, data }) => { must(await safe.write(path, data), "write"); return {}; },
      deleteFile: async ({ path }) => { must(await safe.remove(path), "delete"); return {}; },
      readdir: async ({ path }) => ({ files: must(await safe.list(path), "list").files.map((name) => ({ name })) }),
    },
  };
}

let _fsPromise = null;
function fs() {
  if (!hasPrivateFileCopy()) return null;
  if (!isNative()) {
    if (!_fsPromise) _fsPromise = Promise.resolve(desktopFs());
    return _fsPromise;
  }
  if (!_fsPromise) {
    _fsPromise = import("@capacitor/filesystem")
      .then((m) => ({ Filesystem: m.Filesystem, dir: m.Directory.Library, utf8: m.Encoding.UTF8 }))
      .catch(() => { _fsPromise = null; return null; });
  }
  return _fsPromise;
}

// Serialise every file operation so two writes can never interleave on the
// same slot.
let _chain = Promise.resolve();
function queue(fn) {
  const run = _chain.then(fn, fn);
  _chain = run.catch(() => {});
  return run;
}

// Status for the Settings readout: last success / last error.
// `consecutive` drives the app-wide warning: a copy that fails on every
// save used to be a console line only, so the person believed they were
// protected (audit 2026-10-01, durability M4).
const _status = { lastWriteAt: null, lastError: null, failures: 0, consecutive: 0 };
export function getMirrorStatus() { return { ..._status }; }
function emitHealth() {
  try { window.dispatchEvent(new CustomEvent("symphony-mirror-health", { detail: getMirrorStatus() })); } catch { /* no window */ }
}
function noteOk() {
  const wasFailing = _status.consecutive > 0;
  _status.lastWriteAt = new Date().toISOString();
  _status.consecutive = 0;
  if (wasFailing) emitHealth();
}
function noteErr(e) {
  _status.failures += 1;
  _status.consecutive += 1;
  _status.lastError = String(e?.message || e);
  console.warn("[nativeMirror]", _status.lastError);
  emitHealth();
}

// Kept copies are written only on a sudden shrink or a reset; keep the
// newest few per slot so repeated events can't fill the device (L6).
const KEPT_PER_BASE = 10;
async function pruneKept(F, base) {
  try {
    const dir = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
    const name = base.slice(base.lastIndexOf("/") + 1);
    const kept = (await listDir(F, dir))
      .map((f) => { const m = f.match(/\.kept-(\d+)\.json$/); return f.startsWith(`${name}.kept-`) && m ? { f, t: Number(m[1]) } : null; })
      .filter(Boolean)
      .sort((x, y) => y.t - x.t);
    for (const { f } of kept.slice(KEPT_PER_BASE)) await removeFile(F, `${dir}/${f}`);
  } catch { /* pruning is best-effort */ }
}

// Reversible, collision-free file name for any key / id.
export function encodeName(s) {
  return String(s).replace(/[^A-Za-z0-9_-]/g, (c) => `~${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
export function decodeName(s) {
  return String(s).replace(/~([0-9a-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── Slot format ──
export function packSlot(meta, body) {
  return `${JSON.stringify({ v: 1, ...meta, len: body.length })}\n${body}`;
}
export function unpackSlot(text) {
  if (typeof text !== "string") return null;
  const nl = text.indexOf("\n");
  if (nl < 0) return null;
  let head;
  try { head = JSON.parse(text.slice(0, nl)); } catch { return null; }
  const body = text.slice(nl + 1);
  if (!head || typeof head.seq !== "number" || head.len !== body.length) return null; // torn write
  return { ...head, body };
}
// A blob worth mirroring: a JSON object, never "null" / empty / garbage.
export function isMirrorableBlob(value) {
  return typeof value === "string" && value.length > 1 && value[0] === "{";
}

async function readText(F, path) {
  try {
    const r = await F.Filesystem.readFile({ path: `${ROOT}/${path}`, directory: F.dir, encoding: F.utf8 });
    return typeof r.data === "string" ? r.data : null;
  } catch { return null; }
}
async function writeText(F, path, data) {
  await F.Filesystem.writeFile({ path: `${ROOT}/${path}`, data, directory: F.dir, encoding: F.utf8, recursive: true });
}
async function removeFile(F, path) {
  try { await F.Filesystem.deleteFile({ path: `${ROOT}/${path}`, directory: F.dir }); } catch { /* already gone */ }
}
async function listDir(F, path) {
  try {
    const r = await F.Filesystem.readdir({ path: `${ROOT}/${path}`, directory: F.dir });
    return (r.files || []).map((f) => (typeof f === "string" ? f : f.name)).filter(Boolean);
  } catch { return []; }
}

// Best complete slot of an A/B pair: { slot, seq, at, body } or null.
async function readBestSlot(F, base) {
  const [a, b] = await Promise.all([readText(F, `${base}.a.json`), readText(F, `${base}.b.json`)]);
  const pa = unpackSlot(a);
  const pb = unpackSlot(b);
  if (pa && (!pb || pa.seq >= pb.seq)) return { slot: "a", ...pa };
  if (pb) return { slot: "b", ...pb };
  return null;
}

// Per-base cache of the last written slot/seq/length (saves re-reading).
const _slotCache = new Map();

async function writeSlotted(F, base, body, meta = {}) {
  let cur = _slotCache.get(base);
  if (!cur) {
    const best = await readBestSlot(F, base);
    cur = best ? { slot: best.slot, seq: best.seq, len: best.body.length } : { slot: "b", seq: 0, len: 0 };
  }
  // Sudden shrink (a wipe, a reset, a bad write): keep the bigger copy
  // before the two slots can both be overwritten by the smaller one.
  if (cur.len > SHRINK_MIN_BYTES && body.length < cur.len * SHRINK_RATIO) {
    const best = await readBestSlot(F, base);
    if (best && best.body.length > body.length) {
      await writeText(F, `${base}.kept-${Date.now()}.json`, packSlot({ seq: best.seq, at: best.at, kept: true }, best.body));
      await pruneKept(F, base);
    }
  }
  const slot = cur.slot === "a" ? "b" : "a";
  const seq = cur.seq + 1;
  await writeText(F, `${base}.${slot}.json`, packSlot({ ...meta, seq, at: new Date().toISOString() }, body));
  _slotCache.set(base, { slot, seq, len: body.length });
}

// ── Database blobs ──
const _pending = new Map(); // key → latest value
let _timer = null;

export function mirrorDbBlob(key, value) {
  if (!hasPrivateFileCopy() || !key) return;
  if (!isMirrorableBlob(value)) return;
  _pending.set(key, value);
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => { _timer = null; flushMirror(); }, DEBOUNCE_MS);
}

// Write every pending blob now (also called when the app is backgrounded).
export function flushMirror() {
  if (!_pending.size) return _chain;
  const batch = [..._pending.entries()];
  _pending.clear();
  return queue(async () => {
    const F = await fs();
    if (!F) return;
    for (const [key, value] of batch) {
      try { await writeSlotted(F, `db/${encodeName(key)}`, value, { key }); noteOk(); }
      catch (e) { noteErr(e); }
    }
  });
}

export function deleteDbMirror(key) {
  if (!hasPrivateFileCopy() || !key) return Promise.resolve();
  _pending.delete(key);
  return queue(async () => {
    const F = await fs();
    if (!F) return;
    const base = encodeName(key);
    for (const name of await listDir(F, "db")) {
      if (name === `${base}.a.json` || name === `${base}.b.json` || name.startsWith(`${base}.kept-`)) {
        await removeFile(F, `db/${name}`);
      }
    }
    _slotCache.delete(`db/${base}`);
  });
}

// Recovery-screen reset: the live copy stops being "current" (so boot won't
// restore it straight back into the screen the user is escaping) but is
// KEPT as a kept-copy, listed by every recovery screen. Never deletes data.
export function retireDbMirror(key) {
  if (!hasPrivateFileCopy() || !key) return Promise.resolve();
  _pending.delete(key);
  return queue(async () => {
    const F = await fs();
    if (!F) return;
    const base = `db/${encodeName(key)}`;
    const best = await readBestSlot(F, base);
    if (best) {
      await writeText(F, `${base}.kept-${Date.now()}.json`, packSlot({ seq: best.seq, at: best.at, kept: true }, best.body));
      await pruneKept(F, base);
    }
    await removeFile(F, `${base}.a.json`);
    await removeFile(F, `${base}.b.json`);
    _slotCache.delete(base);
  });
}

// "Delete all local data" — the one flow where every copy must go.
export function wipeMirror() {
  if (!hasPrivateFileCopy()) return Promise.resolve();
  _pending.clear();
  if (_timer) { clearTimeout(_timer); _timer = null; }
  return queue(async () => {
    const F = await fs();
    if (!F) return;
    try { await F.Filesystem.rmdir({ path: ROOT, directory: F.dir, recursive: true }); } catch { /* nothing there */ }
    _slotCache.clear();
  });
}

// Keys with a mirrored current copy.
export async function listMirroredDbKeys() {
  const F = await fs();
  if (!F) return [];
  const keys = new Set();
  for (const name of await listDir(F, "db")) {
    const m = name.match(/^(.*)\.(a|b)\.json$/);
    if (m) keys.add(decodeName(m[1]));
  }
  return [...keys];
}

export async function readBestDbMirror(key) {
  const F = await fs();
  if (!F) return null;
  const best = await readBestSlot(F, `db/${encodeName(key)}`);
  return best ? { raw: best.body, at: best.at || null, seq: best.seq } : null;
}

// Every recoverable copy: current + kept, for the recovery screens.
// [{ key, raw, at, kind: "current" | "kept" }]
export async function listAllDbMirrorCopies() {
  const F = await fs();
  if (!F) return [];
  const out = [];
  const names = await listDir(F, "db");
  for (const key of await listMirroredDbKeys()) {
    const best = await readBestSlot(F, `db/${encodeName(key)}`);
    if (best) out.push({ key, raw: best.body, at: best.at || null, kind: "current" });
  }
  for (const name of names) {
    const m = name.match(/^(.*)\.kept-(\d+)\.json$/);
    if (!m) continue;
    const slot = unpackSlot(await readText(F, `db/${name}`));
    if (slot) out.push({ key: decodeName(m[1]), raw: slot.body, at: new Date(Number(m[2])).toISOString(), kind: "kept" });
  }
  return out;
}

// ── Registry ──
export function mirrorRegistry(reg) {
  if (!hasPrivateFileCopy() || !reg) return Promise.resolve();
  let body;
  try { body = JSON.stringify(reg); } catch { return Promise.resolve(); }
  return queue(async () => {
    const F = await fs();
    if (!F) return;
    try { await writeSlotted(F, "registry", body); noteOk(); } catch (e) { noteErr(e); }
  });
}
export async function readRegistryMirror() {
  const F = await fs();
  if (!F) return null;
  const best = await readBestSlot(F, "registry");
  if (!best) return null;
  try { return JSON.parse(best.body); } catch { return null; }
}

// ── Pictures & fonts ("img" | "font") ──
export function mirrorMedia(kind, id, dataUrl) {
  if (!hasPrivateFileCopy() || !id || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return Promise.resolve();
  return queue(async () => {
    const F = await fs();
    if (!F) return;
    try { await writeText(F, `${kind}/${encodeName(id)}.json`, JSON.stringify({ id, data: dataUrl })); noteOk(); }
    catch (e) { noteErr(e); }
  });
}
export function deleteMediaMirror(kind, id) {
  if (!hasPrivateFileCopy() || !id) return Promise.resolve();
  return queue(async () => {
    const F = await fs();
    if (F) await removeFile(F, `${kind}/${encodeName(id)}.json`);
  });
}
export async function listMediaMirror(kind) {
  const F = await fs();
  if (!F) return [];
  return (await listDir(F, kind))
    .map((n) => n.match(/^(.*)\.json$/))
    .filter(Boolean)
    .map((m) => decodeName(m[1]));
}
export async function readMediaMirror(kind, id) {
  const F = await fs();
  if (!F) return null;
  const text = await readText(F, `${kind}/${encodeName(id)}.json`);
  if (!text) return null;
  try { const o = JSON.parse(text); return typeof o.data === "string" ? o.data : null; } catch { return null; }
}

// Flush pending blobs whenever the app goes to the background — the
// moment Android may kill the process.
let _lifecycleHooked = false;
export async function hookMirrorLifecycle() {
  if (!hasPrivateFileCopy() || _lifecycleHooked) return;
  _lifecycleHooked = true;
  if (isNative()) {
    try {
      const { App } = await import("@capacitor/app");
      await App.addListener("pause", () => { flushMirror(); });
    } catch { /* flush still happens on the debounce */ }
  } else {
    // Desktop: the window closing is the "pause".
    try { window.addEventListener("pagehide", () => { flushMirror(); }); } catch { /* SSR */ }
  }
  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushMirror();
    });
  } catch { /* SSR */ }
}
