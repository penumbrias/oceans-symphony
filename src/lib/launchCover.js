// The launch screen (v0.366.1).
//
// index.html paints a launch cover (#launch-cover) before any JS runs, and
// on Android MainActivity holds the system launch screen too. Both stay up
// until the first screen is actually ready, so opening the app shows one
// calm loading screen instead of a blank page, a spinner, a page spinner
// and then widgets popping in one by one.
//
// "Ready" means:
//   - a setup / unlock / recovery screen is showing (hide at once), or
//   - the main app is up, no page or widget code is still arriving
//     (anything rendering a [data-launch-pending] placeholder) and no data
//     query is loading, for a few checks in a row.
// A time limit always lifts it, so a slow or stuck query can never keep
// anyone off their data.
import { isNative, getNativePlatform } from "@/lib/platform";

const COVER_ID = "launch-cover";
// Longest the cover waits for the main app's first screen once it starts
// rendering. Boot itself is not counted (that's the white-screen watchdog's
// job in index.html).
const READY_MAX_MS = 6000;
// Absolute limit from when this module loads.
const HARD_MAX_MS = 15000;
const CHECK_EVERY_MS = 60;
const STABLE_CHECKS = 3;

let hidden = false;

function isAndroidApp() {
  try { return isNative() && getNativePlatform() === "android"; } catch { return false; }
}

async function releaseNativeLaunchScreen() {
  if (!isAndroidApp()) return;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    await registerPlugin("LaunchScreen").hide();
  } catch { /* older native shell without the plugin: its own limit lifts it */ }
}

export function launchCoverHidden() {
  return hidden;
}

export function hideLaunchCover() {
  if (hidden) return;
  hidden = true;
  try { performance.mark("launch-ready"); } catch { /* ok */ }
  releaseNativeLaunchScreen();
  const el = typeof document !== "undefined" ? document.getElementById(COVER_ID) : null;
  if (!el) return;
  // On Android the system launch screen sat over this cover, so it goes
  // with it — a fade would flash the cover for a moment after it.
  if (isAndroidApp()) { el.remove(); return; }
  el.classList.add("launch-cover--out");
  setTimeout(() => el.remove(), 350);
}

// Safety net: whatever happens, the cover comes down.
if (typeof window !== "undefined") {
  setTimeout(hideLaunchCover, HARD_MAX_MS);
}

function somethingStillLoading(queryClient) {
  try {
    if (queryClient && queryClient.isFetching() > 0) return true;
  } catch { /* treat as not loading */ }
  return !!document.querySelector("[data-launch-pending]");
}

// Watches the main app until its first screen has settled, then lifts the
// cover. Returns a cleanup.
export function watchForFirstScreen(queryClient) {
  if (hidden) return () => {};
  const started = Date.now();
  let stable = 0;
  let raf = null;
  let fallback = null;
  const iv = setInterval(() => {
    stable = somethingStillLoading(queryClient) ? 0 : stable + 1;
    if (stable >= STABLE_CHECKS || Date.now() - started > READY_MAX_MS) {
      clearInterval(iv);
      // Two frames: let the settled screen paint before the cover goes.
      // The timer is for Android, where the held system launch screen stops
      // the web view drawing — so frames may never come until it's lifted.
      raf = requestAnimationFrame(() => { raf = requestAnimationFrame(hideLaunchCover); });
      fallback = setTimeout(hideLaunchCover, 120);
    }
  }, CHECK_EVERY_MS);
  return () => {
    clearInterval(iv);
    if (raf != null) cancelAnimationFrame(raf);
    if (fallback != null) clearTimeout(fallback);
  };
}
