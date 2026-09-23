// Background device sync while the app is open.
//
// Mounted once from AppLayout — deliberately NOT from App.jsx's boot
// path. Nothing here may run before initLocalDb has completed, and the
// boot path has a seven-scenario contract that a feature hook has no
// business touching (CLAUDE.md, Storage Layer Invariants).
//
// Everything is guarded so this can never be the reason the app misbehaves:
//   - does nothing unless a folder is configured and auto-sync is on
//   - never runs two passes at once
//   - skips while the window is hidden (a phone unplugged in a background
//     tab would just log errors every 30s)
//   - swallows its own errors; the Settings panel is where a user goes to
//     see what went wrong, and a failed background pass must not toast at
//     them mid-journal-entry

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSyncAdapter } from "@/lib/syncAdapters";
import { getSyncFolder, isAutoSyncOn, runSync, hasIncomingChanges } from "@/lib/deviceSyncRunner";

// Long enough that an MTP-mounted phone isn't hammered, short enough that
// "plug in, it syncs" feels true.
const POLL_MS = 30_000;

export function useAutoDeviceSync() {
  const queryClient = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    const adapter = getSyncAdapter();
    if (!adapter.available) return undefined;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || running.current) return;
      if (!isAutoSyncOn()) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!getSyncFolder() && adapter.canPickFolder) return;

      running.current = true;
      try {
        // Cheap listing first: if no peer file changed, a full pass would
        // still rewrite our snapshot on every tick for nothing.
        const incoming = await hasIncomingChanges();
        if (!incoming) return;
        const report = await runSync({ force: false });
        if (!cancelled && report?.merged?.length) queryClient.invalidateQueries();
      } catch {
        // Silent on purpose — see header.
      } finally {
        running.current = false;
      }
    };

    // A small delay on mount so a sync never competes with first paint.
    const first = setTimeout(tick, 4000);
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [queryClient]);
}

export default useAutoDeviceSync;
