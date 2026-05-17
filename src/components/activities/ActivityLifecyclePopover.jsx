import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, CircleSlash2, XCircle, Ban, Calendar, Undo2 } from "lucide-react";
import {
  ACTIVITY_STATUSES,
  STATUS_LABELS,
  statusFor,
  appendRescheduleEntry,
} from "@/lib/activityStatus";

// Lifecycle popover for a single Activity. Opens from:
//   • Long-press on a scheduled chip in the week grid
//   • The Activity Details modal footer (for any non-logged record)
//   • The Unresolved Plans card on the Dashboard
//
// Phase 1: actions apply to ONE instance even for recurring plans.
// Phase 2 will introduce a this/this-and-future/all branch.

export default function ActivityLifecyclePopover({
  isOpen,
  onClose,
  activity,
  onChanged,
}) {
  const [submode, setSubmode] = useState(null); // null | "partial" | "skipped" | "cancelled" | "reschedule"
  const [actualMinutes, setActualMinutes] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [newDateTime, setNewDateTime] = useState(() => {
    if (!activity?.timestamp) return "";
    try { return format(new Date(activity.timestamp), "yyyy-MM-dd'T'HH:mm"); }
    catch { return ""; }
  });
  const [saving, setSaving] = useState(false);

  const status = useMemo(() => statusFor(activity), [activity]);
  const isResolvedState = useMemo(() => {
    return [
      ACTIVITY_STATUSES.DONE,
      ACTIVITY_STATUSES.PARTIAL,
      ACTIVITY_STATUSES.SKIPPED,
      ACTIVITY_STATUSES.CANCELLED,
    ].includes(status);
  }, [status]);

  if (!activity) return null;

  const isRecurring = !!activity.recurrence_group_id;

  const reset = () => {
    setSubmode(null);
    setActualMinutes("");
    setResolutionNote("");
  };

  const closeAll = () => {
    reset();
    onClose?.();
  };

  const writeStatus = async (patch, successMsg) => {
    setSaving(true);
    try {
      await base44.entities.Activity.update(activity.id, patch);
      toast.success(successMsg);
      onChanged?.();
      closeAll();
    } catch (err) {
      toast.error(err?.message || "Couldn't update plan");
    } finally {
      setSaving(false);
    }
  };

  const markDone = () => writeStatus(
    { status: ACTIVITY_STATUSES.DONE },
    "Marked done"
  );

  const markPartialFlag = () => writeStatus(
    { status: ACTIVITY_STATUSES.PARTIAL, actual_duration_minutes: null },
    "Marked partial"
  );

  const markPartialWithTime = () => {
    const n = parseInt(actualMinutes, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a positive number of minutes");
      return;
    }
    return writeStatus(
      { status: ACTIVITY_STATUSES.PARTIAL, actual_duration_minutes: n },
      `Marked partial (${n}m)`
    );
  };

  const markSkipped = () => {
    const trimmed = resolutionNote.trim();
    const baseNote = activity.notes || "";
    const merged = trimmed
      ? (baseNote ? `${baseNote}\n\n[Skipped] ${trimmed}` : `[Skipped] ${trimmed}`)
      : baseNote;
    return writeStatus(
      { status: ACTIVITY_STATUSES.SKIPPED, notes: merged || null },
      "Marked skipped"
    );
  };

  const markCancelled = () => {
    const trimmed = resolutionNote.trim();
    const baseNote = activity.notes || "";
    const merged = trimmed
      ? (baseNote ? `${baseNote}\n\n[Cancelled] ${trimmed}` : `[Cancelled] ${trimmed}`)
      : baseNote;
    return writeStatus(
      { status: ACTIVITY_STATUSES.CANCELLED, notes: merged || null },
      "Cancelled"
    );
  };

  const undo = () => writeStatus(
    {
      status: ACTIVITY_STATUSES.SCHEDULED,
      actual_duration_minutes: null,
    },
    "Restored to scheduled"
  );

  const reschedule = async () => {
    if (!newDateTime) {
      toast.error("Pick a new date and time");
      return;
    }
    let parsed;
    try { parsed = new Date(newDateTime); } catch { /* fallthrough */ }
    if (!parsed || Number.isNaN(parsed.getTime())) {
      toast.error("Invalid date/time");
      return;
    }
    const fromIso = activity.timestamp;
    const toIso = parsed.toISOString();
    if (fromIso && new Date(fromIso).getTime() === parsed.getTime()) {
      toast.error("Pick a different time");
      return;
    }
    const nextHistory = appendRescheduleEntry(activity.reschedule_history, fromIso, toIso);
    // Keep status "scheduled" — rescheduling never resolves.
    return writeStatus(
      {
        timestamp: toIso,
        status: ACTIVITY_STATUSES.SCHEDULED,
        reschedule_history: nextHistory,
      },
      "Rescheduled"
    );
  };

  // Header — title + status chip
  const ts = activity.timestamp ? new Date(activity.timestamp) : null;

  return (
    <Dialog open={isOpen} onOpenChange={closeAll}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{activity.activity_name || "Plan"}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {STATUS_LABELS[status] || status}
            </span>
          </DialogTitle>
          {ts && (
            <p className="text-xs text-muted-foreground">
              {format(ts, "EEE d MMM, HH:mm")}
            </p>
          )}
        </DialogHeader>

        {isRecurring && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1.5">
            Recurring plan — this action only affects this instance. (Editing all instances coming soon.)
          </div>
        )}

        {/* Submodes */}
        {submode === "partial" && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Mark partial</div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" disabled={saving} onClick={markPartialFlag}>
                Just flag partial
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={actualMinutes}
                  onChange={e => setActualMinutes(e.target.value)}
                  placeholder="Actual minutes"
                  className="h-9 text-sm"
                />
                <Button onClick={markPartialWithTime} disabled={saving} className="whitespace-nowrap">
                  Enter actual time
                </Button>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset} className="w-full">Back</Button>
          </div>
        )}

        {(submode === "skipped" || submode === "cancelled") && (
          <div className="space-y-3">
            <div className="text-sm font-medium">
              {submode === "skipped" ? "Mark skipped" : "Cancel plan"}
            </div>
            <Input
              value={resolutionNote}
              onChange={e => setResolutionNote(e.target.value)}
              placeholder="Optional note (why?)"
              className="h-9 text-sm"
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset} className="flex-1">Back</Button>
              <Button
                onClick={submode === "skipped" ? markSkipped : markCancelled}
                disabled={saving}
                className="flex-1"
              >
                {submode === "skipped" ? "Skip" : "Cancel plan"}
              </Button>
            </div>
          </div>
        )}

        {submode === "reschedule" && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Reschedule</div>
            <input
              type="datetime-local"
              value={newDateTime}
              onChange={e => setNewDateTime(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset} className="flex-1">Back</Button>
              <Button onClick={reschedule} disabled={saving} className="flex-1">
                Save
              </Button>
            </div>
            {(activity.reschedule_history || []).length > 0 && (
              <div className="text-[11px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/40">
                <p className="font-medium">Previous reschedules:</p>
                {(activity.reschedule_history || []).slice(-3).map((h, i) => (
                  <div key={i}>
                    {format(new Date(h.from), "MMM d HH:mm")} → {format(new Date(h.to), "MMM d HH:mm")}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Default view — action buttons */}
        {submode === null && (
          <div className="space-y-2">
            {status === ACTIVITY_STATUSES.SCHEDULED && (
              <>
                <Button variant="outline" className="w-full justify-start gap-2" disabled={saving} onClick={markDone}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Mark as Done
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" disabled={saving} onClick={() => setSubmode("partial")}>
                  <CircleSlash2 className="w-4 h-4 text-amber-500" /> Mark as Partial
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" disabled={saving} onClick={() => setSubmode("skipped")}>
                  <XCircle className="w-4 h-4 text-rose-500" /> Mark as Skipped
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" disabled={saving} onClick={() => setSubmode("cancelled")}>
                  <Ban className="w-4 h-4 text-muted-foreground" /> Cancel
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" disabled={saving} onClick={() => setSubmode("reschedule")}>
                  <Calendar className="w-4 h-4 text-primary" /> Reschedule
                </Button>
              </>
            )}
            {isResolvedState && (
              <>
                <Button variant="outline" className="w-full justify-start gap-2" disabled={saving} onClick={undo}>
                  <Undo2 className="w-4 h-4" /> Undo — restore to scheduled
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" disabled={saving} onClick={() => setSubmode("reschedule")}>
                  <Calendar className="w-4 h-4 text-primary" /> Reschedule
                </Button>
              </>
            )}
            {status === ACTIVITY_STATUSES.LOGGED && (
              <p className="text-xs text-muted-foreground py-2">
                This activity is already logged — no lifecycle actions apply. Use Edit/Delete in the details view instead.
              </p>
            )}
            <Button variant="ghost" className="w-full" onClick={closeAll}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
