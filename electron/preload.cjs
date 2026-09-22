// Oceans Symphony — Electron preload.
//
// Runs sandboxed and context-isolated: the renderer (the same React bundle
// the web and Android builds run) gets exactly one frozen object on
// `window.symphonyDesktop` and no Node access whatsoever.
//
// This object is the ONLY way `src/` can tell it is running on the
// desktop. `src/lib/platform.js` reads it — same runtime-branch rule the
// native target follows (CLAUDE.md "Build Targets": branch at runtime,
// never at build time).
//
// `dataPath` arrives through webPreferences.additionalArguments rather
// than an IPC round trip, because a sandboxed preload cannot call
// app.getPath() and `isDesktop()` has to answer synchronously.

const { contextBridge, ipcRenderer } = require('electron');

const PREFIX = '--symphony-desktop=';

function readInfo() {
  try {
    const arg = process.argv.find((a) => a.startsWith(PREFIX));
    if (!arg) return {};
    return JSON.parse(Buffer.from(arg.slice(PREFIX.length), 'base64').toString('utf8')) || {};
  } catch {
    return {};
  }
}

const info = readInfo();

contextBridge.exposeInMainWorld('symphonyDesktop', Object.freeze({
  isDesktop: true,
  shell: 'electron',
  electronVersion: info.electron || '',
  chromeVersion: info.chrome || '',
  os: info.os || '',
  // Where Chromium keeps this app's IndexedDB. Shown in the desktop
  // first-run notice so "my data lives in a folder I can copy" is a fact
  // the user can act on, not a claim.
  dataPath: info.dataPath || '',
  openDataFolder: () => ipcRenderer.invoke('symphony:open-data-folder'),
}));
