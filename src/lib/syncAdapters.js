// Filesystem adapters for device sync.
//
// The sync engine (src/lib/deviceSync.js) and the runner
// (src/lib/deviceSyncRunner.js) know nothing about any platform. All
// platform knowledge lives here, behind one small interface, so adding
// iOS later is a new adapter rather than a rewrite:
//
//   available       can this build sync at all
//   canPickFolder   can the user choose where (desktop: any folder;
//                   Android: granted once through the system picker;
//                   iOS: no — a fixed folder in the app's Documents)
//   canPastePath    desktop only — a typed path as well as the picker
//   describeFolder(folder) → what to show the user for the stored value
//   folderLabel     what to call the location in the UI
//   pickFolder()    → folder value to store (path or handle), or null if cancelled
//   list(dir)       → [{ name, size, mtimeMs }]
//   read(dir, name) → string
//   write(dir, name, text)
//
// There is no watch(): polling by mtime is what works across MTP mounts
// and removable media, where inotify-style watching silently never fires.
// The runner polls.

import { isDesktop, isNative, getNativePlatform } from "@/lib/platform";

// ── Desktop (Electron) ────────────────────────────────────────────────
//
// On Windows a USB phone is stored as "phone://<device>/<storage>" (see
// electron/windowsPhone.cjs); show it the way File Explorer would.
function describeDesktopFolder(folder) {
  if (typeof folder === "string" && folder.startsWith("phone://")) {
    try {
      const [d, s] = folder.slice("phone://".length).split("/").map(decodeURIComponent);
      return `${d} → ${s} → Documents → OceansSymphony (phone over USB)`;
    } catch {
      return folder;
    }
  }
  return folder || "";
}

const electronAdapter = {
  id: "electron",
  available: true,
  canPickFolder: true,
  folderLabel: "Sync folder",
  canPastePath: true,
  describeFolder: describeDesktopFolder,
  async pickFolder() {
    const res = await globalThis.symphonyDesktop.sync.pickFolder();
    if (!res?.ok) throw new Error(res?.error || "Couldn't open the folder picker.");
    return res.path;
  },
  async list(dir) {
    const res = await globalThis.symphonyDesktop.sync.list(dir);
    if (!res?.ok) throw new Error(res?.error || "Couldn't read that folder.");
    return res.files || [];
  },
  async read(dir, name) {
    const res = await globalThis.symphonyDesktop.sync.read(dir, name);
    if (!res?.ok) throw new Error(res?.error || "Couldn't read that file.");
    return res.text;
  },
  async write(dir, name, text) {
    const res = await globalThis.symphonyDesktop.sync.write(dir, name, text);
    if (!res?.ok) throw new Error(res?.error || "Couldn't write to that folder.");
    return res;
  },
  async remove(dir, name) {
    const res = await globalThis.symphonyDesktop.sync.remove(dir, name);
    if (!res?.ok) throw new Error(res?.error || "Couldn't remove that file.");
    return res;
  },
};

// ── iOS (Capacitor) ───────────────────────────────────────────────────
//
// Android used this adapter too until the SAF adapter below replaced it:
// scoped storage hid the desktop's snapshot from it. On iOS the location is
// FIXED: Documents/OceansSymphony. That is a folder the
// desktop can reach over USB (Internal storage → Documents →
// OceansSymphony), which is the whole point — the desktop does the
// reaching, the phone just keeps its snapshot somewhere findable.
const CAPACITOR_DIR = "OceansSymphony";

const capacitorAdapter = {
  id: "capacitor",
  available: true,
  canPickFolder: false,
  canPastePath: false,
  folderLabel: "Documents/OceansSymphony",
  describeFolder: () => "Documents/OceansSymphony",
  async pickFolder() {
    return CAPACITOR_DIR;
  },
  async _fs() {
    const mod = await import("@capacitor/filesystem");
    return { Filesystem: mod.Filesystem, Directory: mod.Directory, Encoding: mod.Encoding };
  },
  async ensureDir() {
    const { Filesystem, Directory } = await this._fs();
    try {
      await Filesystem.mkdir({ path: CAPACITOR_DIR, directory: Directory.Documents, recursive: true });
    } catch {
      // Already exists is the common case and is not an error.
    }
  },
  async list() {
    const { Filesystem, Directory } = await this._fs();
    await this.ensureDir();
    try {
      const res = await Filesystem.readdir({ path: CAPACITOR_DIR, directory: Directory.Documents });
      // readdir returns either strings (older plugin) or FileInfo objects.
      return (res.files || []).map((f) => (typeof f === "string"
        ? { name: f, size: 0, mtimeMs: 0 }
        : { name: f.name, size: f.size || 0, mtimeMs: f.mtime || 0 }));
    } catch (e) {
      throw new Error(e?.message || "Couldn't read the sync folder on this device.");
    }
  },
  async read(_dir, name) {
    const { Filesystem, Directory, Encoding } = await this._fs();
    const res = await Filesystem.readFile({
      path: `${CAPACITOR_DIR}/${name}`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return typeof res.data === "string" ? res.data : String(res.data ?? "");
  },
  async write(_dir, name, text) {
    const { Filesystem, Directory, Encoding } = await this._fs();
    await this.ensureDir();
    // Write to a .part file and move it into place, so an interrupted
    // write (app killed, cable pulled, storage full) can never leave a
    // TRUNCATED snapshot as the live one. That is not hypothetical: a
    // phone snapshot was found cut off mid-string, which made the other
    // device report the whole folder as unreadable.
    //
    // ".part" is deliberately outside the filename pattern readers accept,
    // so a leftover fragment is invisible to sync rather than merged.
    const finalPath = `${CAPACITOR_DIR}/${name}`;
    const partPath = `${finalPath}.part`;
    await Filesystem.writeFile({
      path: partPath,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      data: text,
      recursive: true,
    });
    try {
      // rename() won't overwrite on every Android version, so clear the
      // way first. The window between the two is small, and a missing
      // file is recoverable (next sync rewrites it) where a corrupt one
      // silently poisons the other device.
      try { await Filesystem.deleteFile({ path: finalPath, directory: Directory.Documents }); } catch { /* wasn't there */ }
      await Filesystem.rename({ from: partPath, to: finalPath, directory: Directory.Documents });
    } catch (e) {
      // No rename support: fall back to writing in place, which is what
      // this did before — worse, but better than not syncing at all.
      await Filesystem.writeFile({
        path: finalPath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        data: text,
        recursive: true,
      });
      try { await Filesystem.deleteFile({ path: partPath, directory: Directory.Documents }); } catch { /* best effort */ }
    }
    return { ok: true };
  },
  async remove(_dir, name) {
    const { Filesystem, Directory } = await this._fs();
    await Filesystem.deleteFile({ path: `${CAPACITOR_DIR}/${name}`, directory: Directory.Documents });
    return { ok: true };
  },
};

// ── Android (Storage Access Framework) ────────────────────────────────
//
// Scoped storage hides files the app didn't create — including the
// snapshot the desktop drops into Documents/OceansSymphony over USB — so
// the fixed-folder Filesystem adapter above could only ever sync one way
// (phone → desktop). Verified on a Galaxy S24 / Android 16: the desktop's
// file was in the folder and invisible to the app.
//
// Here the user grants the folder once through the system picker (opened
// at Documents/OceansSymphony, so it's two taps), and the native
// SyncFolder plugin reads and writes through that grant. The chosen
// folder is stored as a JSON handle in the runner's folder key.
const androidSafAdapter = {
  id: "android-saf",
  available: true,
  canPickFolder: true,
  canPastePath: false,
  folderLabel: "Documents/OceansSymphony",
  describeFolder(folder) {
    if (!folder) return "";
    try { return JSON.parse(folder)?.name || "Chosen folder"; } catch { return ""; }
  },
  async _bridge() {
    return import("@/lib/nativeSyncFolder");
  },
  async _handle(dir) {
    const b = await this._bridge();
    const h = b.parseFolderHandle(dir);
    if (!h) throw new Error("Choose a folder to sync through first.");
    return { b, h };
  },
  async pickFolder() {
    // Make sure Documents/OceansSymphony exists so the picker can open
    // right on it. The app may create a folder in Documents (it can't read
    // other apps' files there, which is the whole problem, but mkdir is fine).
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      await Filesystem.mkdir({ path: CAPACITOR_DIR, directory: Directory.Documents, recursive: true });
    } catch { /* already there, or the picker opens one level up */ }
    const b = await this._bridge();
    return b.pickFolderHandle();
  },
  async list(dir) {
    const { b, h } = await this._handle(dir);
    return b.listFolder(h);
  },
  async read(dir, name) {
    const { b, h } = await this._handle(dir);
    return b.readFolderFile(h, name);
  },
  async write(dir, name, text) {
    const { b, h } = await this._handle(dir);
    return b.writeFolderFile(h, name, text);
  },
  async remove(dir, name) {
    const { b, h } = await this._handle(dir);
    return b.removeFolderFile(h, name);
  },
};

// ── Web / TWA ─────────────────────────────────────────────────────────
// A browser tab has no folder it can keep reading and writing across
// sessions without re-prompting, so sync is not offered there. The
// existing import/export is the path for those users. Reported honestly
// rather than shown as a broken button.
const unavailableAdapter = {
  id: "none",
  available: false,
  canPickFolder: false,
  canPastePath: false,
  folderLabel: "",
  describeFolder: () => "",
  reason: "Device sync needs the desktop app or the phone app — a browser tab can't keep access to a folder between visits. Use Export and Import instead.",
  async pickFolder() { return null; },
  async list() { return []; },
  async read() { throw new Error("Sync is not available in the browser."); },
  async write() { throw new Error("Sync is not available in the browser."); },
  async remove() { throw new Error("Sync is not available in the browser."); },
};

export function getSyncAdapter() {
  if (isDesktop() && globalThis.symphonyDesktop?.sync) return electronAdapter;
  if (isNative()) return getNativePlatform() === "android" ? androidSafAdapter : capacitorAdapter;
  return unavailableAdapter;
}

export const syncAvailable = () => getSyncAdapter().available;
