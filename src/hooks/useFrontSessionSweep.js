import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Same shape as nowLocalIso() inside SetFrontModal — separated so the sweep
// can run without depending on the modal being open.
function nowLocalIso() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" +
    pad(d.getMonth() + 1) + "-" +
    pad(d.getDate()) + "T" +
    pad(d.getHours()) + ":" +
    pad(d.getMinutes()) + ":" +
    pad(d.getSeconds()) +
    sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60)
  );
}

// Reconcile fronting sessions on app load. The same sweep already runs
// when the Set Fronters modal opens — but a user who never opens that
// modal can sit with corrupted state forever (duplicates, multiple
// "is_primary: true" rows, ghost-active rows where is_active was flipped
// to false but end_time stays null). This hook runs it once per session
// after a small delay so the rest of the page renders first.
//
// Three reconciliations, all best-effort (any failed individual update is
// swallowed so the sweep doesn't block the UI):
//
//   1. Per-alter dedupe: if an alter has >1 active session, keep the
//      newest and end the rest.
//   2. Multi-primary demotion: if multiple surviving rows still have
//      is_primary: true, demote all but the newest.
//   3. Ghost-active reconciliation: rows with is_active:false and
//      end_time:null get end_time = now so they stop reading as Active
//      in the Timeline popover.
export default function useFrontSessionSweep() {
  const qc = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const id = setTimeout(async () => {
      let touched = false;
      try {
        const active = await base44.entities.FrontingSession.filter({ is_active: true });
        const newModel = active.filter(s => s.alter_id);
        const now = nowLocalIso();

        // 1. dedupe per alter
        const byAlter = {};
        for (const s of newModel) (byAlter[s.alter_id] ||= []).push(s);
        const survivors = [];
        for (const sessions of Object.values(byAlter)) {
          sessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
          survivors.push(sessions[0]);
          for (const stale of sessions.slice(1)) {
            try { await base44.entities.FrontingSession.update(stale.id, { is_active: false, end_time: now }); touched = true; } catch {}
          }
        }

        // 2. demote extra primaries
        const stillPrimary = survivors.filter(s => s.is_primary);
        if (stillPrimary.length > 1) {
          stillPrimary.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
          for (const s of stillPrimary.slice(1)) {
            try { await base44.entities.FrontingSession.update(s.id, { is_primary: false }); touched = true; } catch {}
          }
        }
      } catch { /* fetch failed — skip the live-active pass */ }

      // 3. ghost-active sweep (is_active:false, end_time:null)
      try {
        const ghosts = await base44.entities.FrontingSession.filter({ is_active: false, end_time: null });
        for (const g of ghosts || []) {
          try { await base44.entities.FrontingSession.update(g.id, { end_time: nowLocalIso() }); touched = true; } catch {}
        }
      } catch { /* some backends can't filter on end_time: null — skip */ }

      if (touched) {
        qc.invalidateQueries({ queryKey: ["activeFront"] });
        qc.invalidateQueries({ queryKey: ["frontHistory"] });
      }
    }, 1500); // small delay so the dashboard renders first

    return () => clearTimeout(id);
  }, [qc]);
}
