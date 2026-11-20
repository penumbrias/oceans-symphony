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
import { openExternalUrl } from "@/lib/openExternalUrl";

// Where every desktop install file lives. A .deb install can't replace
// itself (apt owns it), so it gets a link here instead of a hidden button.
export const DESKTOP_RELEASES_URL = "https://github.com/penumbrias/oceans-symphony/releases/latest";

export function openDesktopReleasesPage() {
  return openExternalUrl(DESKTOP_RELEASES_URL);
}

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

// fromMenu: main answers with its own dialogs ("You have the latest
// version", "Restart now / Later"), for doors that have no status line.
export async function checkForDesktopUpdate({ fromMenu = false } = {}) {
  const b = bridge();
  if (!b) return { state: "unsupported" };
  return b.check({ fromMenu });
}

// The page menu's "Check for updates": a self-updating build checks (main
// shows the result); a .deb opens the release page to download by hand.
export async function checkForDesktopUpdateFromMenu() {
  if (await desktopUpdatesSupported()) return checkForDesktopUpdate({ fromMenu: true });
  await openDesktopReleasesPage();
  return { state: "manual" };
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
