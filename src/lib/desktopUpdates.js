// Desktop app updates — the Settings "Check for updates" button.
//
// The Electron main process does the work (electron/main.cjs: it asks the
// app's GitHub releases for a newer version and downloads it). This module
// is the renderer side: it reads the bridge in electron/preload.cjs and,
// before installing, waits for every pending save and the private-file
// copy to finish so the restart can't cut a write short.
import { isDesktop } from "@/lib/platform";
import { whenSavesSettled } from "@/lib/localDb";
import { flushMirror } from "@/lib/nativeMirror";

function bridge() {
  try { return isDesktop() ? window.symphonyDesktop?.updates || null : null; } catch { return null; }
}

export async function desktopUpdatesSupported() {
  const b = bridge();
  if (!b) return false;
  try { return !!(await b.supported()); } catch { return false; }
}

export async function getDesktopUpdateStatus() {
  const b = bridge();
  if (!b) return { state: "unsupported" };
  try { return (await b.status()) || { state: "idle" }; } catch { return { state: "idle" }; }
}

export async function checkForDesktopUpdate() {
  const b = bridge();
  if (!b) return { state: "unsupported" };
  return b.check();
}

// Returns an unsubscribe function.
export function onDesktopUpdateStatus(cb) {
  const b = bridge();
  if (!b?.onStatus) return () => {};
  return b.onStatus(cb);
}

// Save everything, then let main quit, install and reopen the app.
export async function installDesktopUpdate() {
  const b = bridge();
  if (!b) return false;
  try { await whenSavesSettled(); } catch { /* a failed save is already on the save banner */ }
  try { await flushMirror(); } catch { /* best effort — the main copy is saved */ }
  return b.install();
}
