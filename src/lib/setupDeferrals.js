// Things that wait until setup is done (v0.370.3). On a new system the first
// minutes are for the welcome steps, so nothing else asks for attention or
// bandwidth: page-tip banners, prefetching Settings and the web app's full
// offline download (about 3 MB) all hold until setup is finished or skipped.
// Data Saver always skips the downloads.

import { localEntities } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { isOnboardingDone } from "@/lib/onboardingState";

export function dataSaverOn() {
  try { return !!navigator.connection?.saveData; } catch { return false; }
}

// Setup finished, skipped, or found unnecessary (older flags count too).
export async function setupIsDone() {
  try {
    const list = await localEntities.SystemSettings.list();
    return isOnboardingDone(pickPrimarySystemSettings(list));
  } catch { return false; }
}

// Ask the service worker to cache every built chunk for offline use. It
// skips what it already has, so asking once per launch is cheap.
export async function warmOfflineCache() {
  try {
    if (dataSaverOn() || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "warm-cache" });
  } catch { /* no service worker: nothing to warm */ }
}
