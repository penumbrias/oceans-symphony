import { useEffect } from "react";
import { queryClientInstance } from "@/lib/query-client";
import { isNative } from "@/lib/platform";

// The query client is configured with refetchOnWindowFocus:false (to save
// battery/network on mobile). The downside: when the app is backgrounded and
// reopened, cached data — and any render-time "now" — stays stale, so e.g. a
// plan that became active while the app was away isn't recognised until a
// manual refresh, and the displayed date/time can lag behind reality.
//
// On resume / refocus we invalidate active queries ONCE (throttled so rapid
// focus flicker doesn't thrash) — they're local IndexedDB reads, so refetching
// is cheap — which makes consumers re-render against the current wall-clock.
let lastRefresh = 0;
const MIN_INTERVAL_MS = 8000;

function refresh() {
  const now = Date.now();
  if (now - lastRefresh < MIN_INTERVAL_MS) return;
  lastRefresh = now;
  try { queryClientInstance.invalidateQueries(); } catch { /* noop */ }
}

export default function useRefreshOnResume() {
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);

    // Native (Capacitor) resume — some Android WebViews don't fire focus /
    // visibilitychange when returning from background, so listen explicitly.
    let appRemove;
    if (isNative()) {
      import("@capacitor/app")
        .then(({ App }) => App.addListener("resume", refresh).then((h) => { appRemove = () => h.remove(); }))
        .catch(() => {});
    }

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
      try { appRemove?.(); } catch { /* */ }
    };
  }, []);
}
