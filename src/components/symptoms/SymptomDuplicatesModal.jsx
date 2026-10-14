// "Tidy up duplicates" — merge symptoms / habits that are the same thing
// under different names (a preset pack added "Energy" next to an older
// "Energy level", a re-import doubled a few up…). One tap for the lot:
// each group is pre-set to keep the most-used copy, and the person can pick
// a different keeper or leave a group out.
//
// Shown from two places: a banner at the top of the Quick Check-In's
// Symptoms / Habits section, and a card on Manage Check-In. Matching and
// planning are pure (src/lib/symptomDuplicates.js); the writes are
// src/lib/symptomMerge.js — nothing is deleted, merged copies are archived.
//
// A nested Radix dialog (like AlterAssignPopup) so it works from inside the
// Quick Check-In's own dialog — a plain fixed overlay would sit inside that
// dialog's transformed box and its focus trap.

import React, { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Loader2, Layers } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import {
  findDuplicateGroups, planGroup, countSymptomUses, scaleClass, SCALE_LABEL,
} from "@/lib/symptomDuplicates";
import { applySymptomCleanup } from "@/lib/symptomMerge";

// Live duplicate groups for the current catalogue (no use counts — cheap
// enough to run wherever the symptom list is already loaded).
export function useSymptomDuplicateGroups() {
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  return useMemo(() => findDuplicateGroups(symptoms), [symptoms]);
}

const extraCount = (groups) => groups.reduce((n, g) => n + g.rows.length - 1, 0);

// Compact one-line nudge (Quick Check-In). Renders nothing when clean.
export function SymptomDuplicatesBanner({ className = "" }) {
  const groups = useSymptomDuplicateGroups();
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;
  const n = extraCount(groups);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-left text-xs hover:bg-primary/10 transition-colors ${className}`}
      >
        <Layers className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="flex-1 min-w-0">
          {n} {n === 1 ? "item looks" : "items look"} doubled up
        </span>
        <span className="text-primary font-medium flex-shrink-0">Tidy up</span>
      </button>
      <SymptomDuplicatesModal open={open} onOpenChange={setOpen} />
    </>
  );
}

// Card for Manage Check-In. Renders nothing when clean.
export function SymptomDuplicatesCard() {
  const groups = useSymptomDuplicateGroups();
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;
  const n = extraCount(groups);
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-start gap-3">
      <Layers className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium">Some items look doubled up</p>
        <p className="text-xs text-muted-foreground">
          {n} {n === 1 ? "item has" : "items have"} the same name as another (like “Energy” and “Energy level”). Merge them in one go — history moves into the one you keep.
        </p>
      </div>
      <button type="button" onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex-shrink-0">
        Tidy up
      </button>
      <SymptomDuplicatesModal open={open} onOpenChange={setOpen} />
    </div>
  );
}

export default function SymptomDuplicatesModal({ open, onOpenChange, zIndex = 95 }) {
  const queryClient = useQueryClient();
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
    enabled: !!open,
  });
  // Use counts only matter for which copy to suggest keeping — loaded on open.
  const { data: useCounts = null } = useQuery({
    queryKey: ["symptomUseCounts"],
    queryFn: async () => {
      const [checkIns, sessions] = await Promise.all([
        base44.entities.SymptomCheckIn.list().catch(() => []),
        base44.entities.SymptomSession.list().catch(() => []),
      ]);
      return countSymptomUses(checkIns, sessions);
    },
    enabled: !!open,
    staleTime: 0,
  });
  const groups = useMemo(
    () => (useCounts ? findDuplicateGroups(symptoms, useCounts) : []),
    [symptoms, useCounts]
  );

  // Per group: chosen keeper + whether it's included. Absent = defaults.
  const [keeperByKey, setKeeperByKey] = useState({});
  const [skipped, setSkipped] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setKeeperByKey({}); setSkipped(new Set()); }
  }

  const keeperOf = (g) => (g.rows.some((r) => r.id === keeperByKey[g.key]) ? keeperByKey[g.key] : g.keeperId);
  const included = groups.filter((g) => !skipped.has(g.key));

  const handleApply = async () => {
    if (saving || included.length === 0) return;
    setSaving(true);
    try {
      const steps = included.map((g) => ({ keeperId: keeperOf(g), items: planGroup(g, keeperOf(g)) }));
      const { merged, hidden } = await applySymptomCleanup(steps);
      for (const key of ["symptoms", "symptomCheckIns", "symptomSessions", "currentSymptoms", "timeline", "symptomUseCounts"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      const parts = [];
      if (merged) parts.push(`merged ${merged}`);
      if (hidden) parts.push(`hid ${hidden}`);
      toast.success(`Tidied up (${parts.join(", ") || "no changes"})`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.message || "Couldn't tidy up");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50" style={{ zIndex }} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md max-h-[80vh] flex flex-col bg-card border border-border rounded-2xl shadow-2xl focus:outline-none"
          style={{ zIndex, top: "max(8vh, calc(env(safe-area-inset-top, 0px) + 56px))" }}
        >
          <div className="flex items-start gap-2 px-4 py-3 border-b border-border/60">
            <div className="flex-1 min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold">Tidy up duplicates</DialogPrimitive.Title>
              <p className="text-xs text-muted-foreground">
                These look like the same thing under different names. Pick the one to keep — the others’ history moves into it.
              </p>
            </div>
            <DialogPrimitive.Close aria-label="Close" className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground flex-shrink-0">
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2">
            {!useCounts ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nothing doubled up — all tidy.</p>
            ) : groups.map((g) => {
              const keeperId = keeperOf(g);
              const plan = Object.fromEntries(planGroup(g, keeperId).map((p) => [p.row.id, p.action]));
              const on = !skipped.has(g.key);
              return (
                <div key={g.key} className={`border border-border/60 rounded-xl p-2.5 space-y-1 ${on ? "" : "opacity-60"}`}>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" className="accent-[var(--color-primary)] w-3.5 h-3.5" checked={on}
                      onChange={() => setSkipped((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                        return next;
                      })} />
                    {on ? `Tidy these ${g.rows.length}` : "Leave these as they are"}
                  </label>
                  {g.rows.map((r) => {
                    const isKeeper = r.id === keeperId;
                    const uses = useCounts[r.id] || 0;
                    return (
                      <label key={r.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${isKeeper && on ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                        <input type="radio" name={`keep-${g.key}`} className="accent-[var(--color-primary)] w-3.5 h-3.5 flex-shrink-0"
                          checked={isKeeper} disabled={!on}
                          onChange={() => setKeeperByKey((prev) => ({ ...prev, [g.key]: r.id }))}
                          aria-label={`Keep ${r.label}`} />
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color || "#8B5CF6" }} aria-hidden />
                        <span className="flex-1 min-w-0">
                          <span className="text-sm block truncate">{r.label}</span>
                          <span className="text-[0.6875rem] text-muted-foreground block">
                            {SCALE_LABEL[scaleClass(r)]} · {uses} {uses === 1 ? "log" : "logs"}
                            {on && !isKeeper && plan[r.id] === "merge" && " · merges into the kept one"}
                            {on && !isKeeper && plan[r.id] === "hide" && " · different scale, so it’s hidden and keeps its own history"}
                          </span>
                        </span>
                        {isKeeper && on && <span className="text-[0.625rem] uppercase tracking-wide text-primary font-medium flex-shrink-0">keep</span>}
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-border/60 flex gap-2">
            <DialogPrimitive.Close className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted/50" disabled={saving}>
              Cancel
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={handleApply}
              disabled={saving || !useCounts || included.length === 0}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {included.length > 1 ? `Tidy up ${included.length} groups` : "Tidy up"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
