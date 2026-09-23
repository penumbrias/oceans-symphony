// Filesystem adapters for device sync.
//
// The sync engine (src/lib/deviceSync.js) and the runner
// (src/lib/deviceSyncRunner.js) know nothing about any platform. All
// platform knowledge lives here, behind one small interface, so adding
// iOS later is a new adapter rather than a rewrite:
//
//   available       can this build sync at all
//   canPickFolder   can the user choose where (desktop yes, Android no —
//                   scoped storage means we use a fixed known folder)
//   folderLabel     what to call the location in the UI
//   pickFolder()    → absolute path, or null if cancelled
//   list(dir)       → [{ name, size, mtimeMs }]
//   read(dir, name) → string
//   write(dir, name, text)
//
// There is no watch(): polling by mtime is what works across MTP mounts
// and removable media, where inotify-style watching silently never fires.
// The runner polls.

import { isDesktop, isNative } from "@/lib/platform";

// ── Desktop (Electron) ────────────────────────────────────────────────
const electronAdapter = {
  id: "electron",
  available: true,
  canPickFolder: true,
  folderLabel: "Sync folder",
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
};

// ── Android / iOS (Capacitor) ─────────────────────────────────────────
//
// Scoped storage means the app can't be handed an arbitrary folder, so
// the location is FIXED: Documents/OceansSymphony. That is a folder the
// desktop can reach over USB (Internal storage → Documents →
// OceansSymphony), which is the whole point — the desktop does the
// reaching, the phone just keeps its snapshot somewhere findable.
const CAPACITOR_DIR = "OceansSymphony";

const capacitorAdapter = {
  id: "capacitor",
  available: true,
  canPickFolder: false,
  folderLabel: "Documents/OceansSymphony",
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
    await Filesystem.writeFile({
      path: `${CAPACITOR_DIR}/${name}`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      data: text,
      recursive: true,
    });
    return { ok: true };
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
  folderLabel: "",
  reason: "Device sync needs the desktop app or the phone app — a browser tab can't keep access to a folder between visits. Use Export and Import instead.",
  async pickFolder() { return null; },
  async list() { return []; },
  async read() { throw new Error("Sync is not available in the browser."); },
  async write() { throw new Error("Sync is not available in the browser."); },
};

export function getSyncAdapter() {
  if (isDesktop() && globalThis.symphonyDesktop?.sync) return electronAdapter;
  if (isNative()) return capacitorAdapter;
  return unavailableAdapter;
}

export const syncAvailable = () => getSyncAdapter().available;
