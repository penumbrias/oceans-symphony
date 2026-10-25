import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { reconcileActiveFront } from "@/lib/setFront";

// Reconcile fronting sessions on app load, so someone who never opens a
// set-front surface doesn't sit with broken rows forever: duplicate active
// sessions for one alter, more than one primary, and "ghost" rows that were
// ended (is_active false) without an end time. The cleaning itself is
// setFront.reconcileActiveFront — the one cleaner every surface uses. Runs
// once per session after a short delay so the page renders first.
export default function useFrontSessionSweep() {
  const qc = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const id = setTimeout(async () => {
      try {
        const { cleanupHappened } = await reconcileActiveFront();
        if (cleanupHappened) {
          qc.invalidateQueries({ queryKey: ["activeFront"] });
          qc.invalidateQueries({ queryKey: ["frontHistory"] });
        }
      } catch { /* best-effort — never block the app */ }
    }, 1500); // small delay so the dashboard renders first

    return () => clearTimeout(id);
  }, [qc]);
}
