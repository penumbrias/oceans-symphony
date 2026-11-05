// JS bridge to the custom SyncFolderPlugin (Android Java) — device-sync
// folder access through the Storage Access Framework. See the plugin's
// header for why: under scoped storage the app can't see files the desktop
// drops into Documents over USB unless the user grants the folder once.
//
// Folder handle stored by the sync runner (symphony_sync_folder) as JSON:
//   { uri, docId, name }   — uri: persisted tree grant; docId: directory
//                            inside it; name: what to show the user.
//
// Android-only. Imported dynamically from syncAdapters.js so web builds
// never load it.

import { registerPlugin } from "@capacitor/core";

const SyncFolder = registerPlugin("SyncFolder");

export function parseFolderHandle(raw) {
  if (!raw) return null;
  try {
    const h = JSON.parse(raw);
    return h && typeof h === "object" && h.uri ? h : null;
  } catch {
    return null; // an old fixed-path value from before the picker — ignored
  }
}

export async function pickFolderHandle() {
  const res = await SyncFolder.pickFolder({});
  if (!res || res.cancelled || !res.uri) return null;
  return JSON.stringify({ uri: res.uri, docId: res.docId || null, name: res.name || "Chosen folder" });
}

export async function hasFolderAccess(handle) {
  if (!handle?.uri) return false;
  try { return !!(await SyncFolder.hasAccess({ uri: handle.uri }))?.ok; } catch { return false; }
}

export async function listFolder(handle) {
  const res = await SyncFolder.list({ uri: handle.uri, docId: handle.docId || undefined });
  return (res?.files || []).map((f) => ({ name: f.name, size: Number(f.size) || 0, mtimeMs: Number(f.mtime) || 0 }));
}

// Read in pieces (v0.357.1). A whole-file read made the native side hold
// several copies of a big snapshot at once and Android closed the app
// (OutOfMemoryError). Each piece is decoded as it arrives; the decoder's
// stream mode keeps a character split across two pieces intact.
const CHUNK_BYTES = 2 * 1024 * 1024;
// A snapshot can't grow without bound while we read it; this stops a file
// that keeps changing size from looping forever.
const MAX_PIECES = 4096;

function base64ToBytes(b64) {
  const bin = atob(b64 || "");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function readFolderFile(handle, name) {
  const decoder = new TextDecoder("utf-8");
  const parts = [];
  let offset = 0;
  let size = null;
  for (let i = 0; i < MAX_PIECES; i++) {
    const res = await SyncFolder.readChunk({
      uri: handle.uri, docId: handle.docId || undefined, name, offset, length: CHUNK_BYTES,
    });
    const bytes = base64ToBytes(res?.data);
    if (size === null) size = Number(res?.size) || 0;
    else if (Number(res?.size) !== size) {
      // The other device rewrote the file mid-read: the pieces would be a
      // mix of two files. Fail this read; the next pass reads it whole.
      throw new Error("That file changed while it was being read. It will be read again on the next sync.");
    }
    offset += bytes.length;
    parts.push(decoder.decode(bytes, { stream: !res?.eof }));
    if (res?.eof || bytes.length === 0) {
      if (offset < size) throw new Error("That file was cut short while it was being read.");
      return parts.join("");
    }
  }
  throw new Error("That file is too large to read.");
}

// Write in pieces too (v0.357.2): the whole-string write held the snapshot
// several times over on the native side, like the old read. Pieces go to
// name.part; writeCommit checks the byte count before it replaces the live
// file, so an interrupted write never goes live.
const WRITE_CHARS = 1024 * 1024;

// Cut points that never split a surrogate pair (an emoji cut in half would
// be written as "?" on each side).
export function writePieces(text, size = WRITE_CHARS) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + size);
    if (end < text.length) {
      const c = text.charCodeAt(end - 1);
      if (c >= 0xd800 && c <= 0xdbff) end -= 1;
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

export async function writeFolderFile(handle, name, text) {
  const base = { uri: handle.uri, docId: handle.docId || undefined, name };
  const encoder = new TextEncoder();
  let bytes = 0;
  await SyncFolder.writeBegin(base);
  for (const piece of writePieces(text)) {
    bytes += encoder.encode(piece).length;
    await SyncFolder.writeChunk({ ...base, data: piece });
  }
  await SyncFolder.writeCommit({ ...base, size: bytes });
  return { ok: true };
}

export async function removeFolderFile(handle, name) {
  await SyncFolder.remove({ uri: handle.uri, docId: handle.docId || undefined, name });
  return { ok: true };
}
