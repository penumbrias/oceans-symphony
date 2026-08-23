// "Try it" safety net for setup packs.
//
// Applying a pack replaces how the whole app looks, which is a lot to
// commit to from a checklist. Every apply writes a full-fidelity
// restore point first (SystemSettings.ui_v2_restore_point — see
// lib/setupPacks buildRestorePoint), and this bar is the way back:
// Keep dismisses it, "Put it back" restores the previous setup exactly.
//
// It survives a reload (the marker is in localStorage and the restore
// point in settings), because "I'll decide later" is a normal thing to
// do with a new look — and because a trial the user forgot about must
// never become permanent by accident.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { restorePatchFrom, applyAppTheme } from "@/lib/setupPacks";

const MARK_KEY = "symphony_pack_trial_v1";

export default function PackRestoreBar() {
  const qc = useQueryClient();
  const [mark, setMark] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MARK_KEY) || "null"); } catch { return null; }
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(), enabled: !!mark,
  });
  const settingsRow = rows[0] || null;
  const point = settingsRow?.ui_v2_restore_point || null;

  useEffect(() => {
    const on = (e) => {
      // Only a trial parks the bar on screen; a plain Apply is a
      // decision already made (its toast carries the same message).
      if (!e?.detail?.trial) return;
      const next = { title: e.detail.title || "Pack", at: Date.now() };
      setMark(next);
      try { localStorage.setItem(MARK_KEY, JSON.stringify(next)); } catch { /* storage off */ }
    };
    window.addEventListener("os-pack-applied", on);
    return () => window.removeEventListener("os-pack-applied", on);
  }, []);

  const clear = () => {
    setMark(null);
    try { localStorage.removeItem(MARK_KEY); } catch { /* storage off */ }
  };

  const putItBack = async () => {
    if (!settingsRow?.id || !point) { clear(); return; }
    try {
      const patch = restorePatchFrom(point);
      if (patch) await base44.entities.SystemSettings.update(settingsRow.id, patch);
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      applyAppTheme(point.appTheme);
      clear();
      toast.success("Put back the way it was");
    } catch (e) { toast.error(e?.message || "Couldn't restore"); }
  };

  if (!mark) return null;
  return createPortal(
    <div
      className="fixed left-2 right-2 z-[75] rounded-xl border shadow-xl px-3 py-2 flex items-center gap-2 backdrop-blur-xl"
      style={{
        // Above the bottom chrome AND the system navigation buttons.
        bottom: "calc(var(--v2-bottom-chrome-h, var(--bottom-nav-height, 56px)) + var(--os-sab) + 8px)",
        background: "hsl(var(--card))",
        borderColor: "color-mix(in srgb, var(--v2-accent, hsl(var(--primary))) 40%, transparent)",
      }}
      role="status"
    >
      <span className="flex-1 min-w-0">
        <span className="text-xs font-semibold block truncate">Trying “{mark.title}”</span>
        <span className="text-[0.6875rem] text-muted-foreground">Keep it, or put your old setup back.</span>
      </span>
      <button type="button" onClick={putItBack}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1 flex-shrink-0">
        <RotateCcw className="w-3 h-3" /> Put it back
      </button>
      <button type="button" onClick={clear}
        className="text-xs px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground flex items-center gap-1 flex-shrink-0">
        <Check className="w-3 h-3" /> Keep
      </button>
    </div>,
    document.body
  );
}
