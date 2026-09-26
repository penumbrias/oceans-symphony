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

export async function readFolderFile(handle, name) {
  const res = await SyncFolder.read({ uri: handle.uri, docId: handle.docId || undefined, name });
  return typeof res?.data === "string" ? res.data : String(res?.data ?? "");
}

export async function writeFolderFile(handle, name, text) {
  await SyncFolder.write({ uri: handle.uri, docId: handle.docId || undefined, name, data: text });
  return { ok: true };
}

export async function removeFolderFile(handle, name) {
  await SyncFolder.remove({ uri: handle.uri, docId: handle.docId || undefined, name });
  return { ok: true };
}
