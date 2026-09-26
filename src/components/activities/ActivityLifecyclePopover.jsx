import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { syncActivityResolved } from "@/lib/linkedCompletion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { useTerms } from "@/lib/useTerms";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { parseSignpostAuthors } from "@/lib/signpostAuthors";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, CircleSlash2, XCircle, Ban, Calendar, Undo2, Play } from "lucide-react";
import { addActiveActivity, getActiveActivities } from "@/lib/activitySession";
import {
  ACTIVITY_STATUSES,
  STATUS_LABELS,
  statusFor,
  appendRescheduleEntry,
} from "@/lib/activityStatus";
import {
  RECURRENCE_BRANCHES,
  membersForBranch,
  applyEditToSeries,
} from "@/lib/recurrenceUtils";
import RecurrenceBranchDialog from "@/components/activities/RecurrenceBranchDialog";
import {
  cancelPlanReminder,
  schedulePlanReminder,
} from "@/lib/planReminderScheduler";

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
  const terms = useTerms();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const [submode, setSubmode] = useState(null); // null | "partial" | "skipped" | "cancelled" | "reschedule"
  const [actualMinutes, setActualMinutes] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  // Quick plans only carry a date — the time-of-day on the timestamp
  // is an EOD sentinel (23:59) used to keep them in the "future" until
  // the day passes. Rescheduling one should ask for a new date, not a
  // datetime; the new EOD sentinel is reapplied on save.
  const isQuickPlan = !!activity?.is_quick_plan;
  const [newDateTime, setNewDateTime] = useState(() => {
    if (!activity?.timestamp) return "";
    try {
      const d = new Date(activity.timestamp);
      return isQuickPlan
        ? format(d, "yyyy-MM-dd")
        : format(d, "yyyy-MM-dd'T'HH:mm");
    } catch { return ""; }
  });
  const [saving, setSaving] = useState(false);
  // When set, the recurrence-branch chooser is open. Holds the patch
  // (and success message) we'll apply once the user picks a branch.
  // Shape: { patch, successMsg, actionLabel }
  const [pendingBranchAction, setPendingBranchAction] = useState(null);
  // Inline notes editor (saved on its own, no status change). Resets to the
  // activity's saved notes whenever a different one opens.
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  useEffect(() => { setNoteDraft(activity?.notes || ""); }, [activity?.id, isOpen]);

  // Pull the full activity list so we can resolve series members when
  // the user picks "this and future" / "all". Cheap — already cached.
  const { data: allActivities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  // Categories — only used to colour the active pill when a plan is started.
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const planColor = useMemo(() => {
    const ids = activity?.activity_category_ids || [];
    for (const id of ids) {
      const c = categories.find((c) => c.id === id);
      if (c?.color) return c.color;
    }
    return activity?.color || null;
  }, [activity, categories]);
  // Is this plan already running as an active session? (re-read on open)
  const alreadyActive = useMemo(
    () => getActiveActivities().some((a) => a.planActivityId === activity?.id),
    [activity?.id, isOpen]
  );

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

  // ONE pipeline for anything typed here: ~commands, whispers, signposts,
  // @mentions. Returns null when the user backed out (or a command was
  // malformed — already toasted). `authorPatch` carries who signed it.
  const prepareNote = async (raw, surfaceLabel) => {
    let prepared;
    try { prepared = await prepareAuthoredText(raw || "", { alters, terms, surfaceLabel, baseAuthorIds: activity.fronting_alter_ids || [] }); }
    catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return null; } throw e; }
    if (prepared === null) return null;
    const signposted = parseSignpostAuthors(raw || "", alters, terms?.system ? [terms.system] : undefined).length > 0;
    const authorPatch = {
      author_alter_ids: prepared.authorIds,
      ...(signposted ? { fronting_alter_ids: prepared.authorIds } : {}),
    };
    const record = () => recordAuthoredText({
      ...prepared, alters, sourceType: "activity", sourceId: activity.id, sourceLabel: "Plan note",
      navigatePath: `/activities?date=${format(new Date(activity.timestamp), "yyyy-MM-dd")}&highlight=${activity.id}`,
    });
    return { prepared, authorPatch, record };
  };

  // Save the notes on their own — no status change, single instance.
  const saveNote = async () => {
    const note = await prepareNote(noteDraft, "note");
    if (!note) return;
    setSavingNote(true);
    try {
      await base44.entities.Activity.update(activity.id, { notes: note.prepared.content.trim() || null, ...note.authorPatch });
      await note.record();
      toast.success("Note saved");
      onChanged?.();
    } catch (err) {
      toast.error(err?.message || "Couldn't save note");
    } finally {
      setSavingNote(false);
    }
  };

  // Start this plan as an in-progress "active" session (reuses the same
  // mechanism as the Log modal's Active toggle / the dashboard's Active
  // Activities). The session is linked back to the plan via planActivityId,
  // so ending it RESOLVES this plan to "done" instead of logging a duplicate.
  // The current notes-box text rides along as the session's note.
  const startActive = () => {
    addActiveActivity({
      planActivityId: activity.id,
      categoryId: (activity.activity_category_ids || [])[0] || null,
      name: activity.activity_name || "Activity",
      color: planColor,
      startTime: new Date().toISOString(),
      alterIds: activity.fronting_alter_ids || [],
      notes: (noteDraft || "").trim(),
    });
    // It's happening now — clear the pending pre-start reminder for it.
    try { cancelPlanReminder(activity.id).catch(() => {}); } catch { /* non-fatal */ }
    toast.success("Started — it's now in your Active Activities");
    onChanged?.();
    closeAll();
  };

  // Single-instance write. Used directly when the plan isn't part of a
  // recurrence series, and indirectly by the branch chooser after the
  // user picks "this only".
  const writeStatus = async (patch, successMsg, afterWrite) => {
    setSaving(true);
    try {
      await base44.entities.Activity.update(activity.id, patch);
      if (afterWrite) await afterWrite();
      // Resolving done/partial completes the linked to-do (Phase 1 sync).
      if (patch.status) await syncActivityResolved(activity, patch.status);
      // Reminder hygiene: resolving a plan cancels its pending OS
      // notification; restoring it to SCHEDULED re-schedules one.
      // Rescheduling is handled separately in the reschedule path.
      if (patch.status && patch.status !== ACTIVITY_STATUSES.SCHEDULED) {
        try { await cancelPlanReminder(activity.id); } catch { /* non-fatal */ }
      } else if (patch.status === ACTIVITY_STATUSES.SCHEDULED) {
        try {
          await schedulePlanReminder({ ...activity, ...patch });
        } catch { /* non-fatal */ }
      }
      toast.success(successMsg);
      onChanged?.();
      closeAll();
    } catch (err) {
      toast.error(err?.message || "Couldn't update plan");
    } finally {
      setSaving(false);
    }
  };

  // Series-aware lifecycle write. For recurring plans, opens the
  // branch chooser. Non-recurring plans drop straight into writeStatus.
  // The reschedule path bypasses this — rescheduling an entire series
  // doesn't make sense (would corrupt the audit trail).
  const writeStatusMaybeBranched = (patch, successMsg, actionLabel = "mark", afterWrite = null) => {
    if (isRecurring) {
      setPendingBranchAction({ patch, successMsg, actionLabel, afterWrite });
      return;
    }
    return writeStatus(patch, successMsg, afterWrite);
  };

  const applyBranchChoice = async (branch) => {
    if (!pendingBranchAction) return;
    const { patch, successMsg, afterWrite } = pendingBranchAction;
    setPendingBranchAction(null);
    setSaving(true);
    try {
      let affected = [activity];
      if (branch === RECURRENCE_BRANCHES.THIS_ONLY) {
        await base44.entities.Activity.update(activity.id, patch);
        toast.success(successMsg);
      } else {
        const members = membersForBranch(allActivities, activity, branch);
        affected = members;
        const count = await applyEditToSeries(members, patch);
        toast.success(`${successMsg} — ${count} ${count === 1 ? "instance" : "instances"} updated`);
      }
      if (afterWrite) await afterWrite();
      // Mirror the reminder hygiene from writeStatus across every
      // affected instance — series resolution should clean up all the
      // pending OS notifications it implicates, not just the pivot.
      if (patch.status && patch.status !== ACTIVITY_STATUSES.SCHEDULED) {
        for (const a of affected) {
          try { await cancelPlanReminder(a.id); } catch { /* non-fatal */ }
        }
      } else if (patch.status === ACTIVITY_STATUSES.SCHEDULED) {
        for (const a of affected) {
          try { await schedulePlanReminder({ ...a, ...patch }); } catch { /* non-fatal */ }
        }
      }
      onChanged?.();
      closeAll();
    } catch (err) {
      toast.error(err?.message || "Couldn't update plan");
    } finally {
      setSaving(false);
    }
  };

  const markDone = () => writeStatusMaybeBranched(
    { status: ACTIVITY_STATUSES.DONE },
    "Marked done",
    "mark done"
  );

  const markPartialFlag = () => writeStatusMaybeBranched(
    { status: ACTIVITY_STATUSES.PARTIAL, actual_duration_minutes: null },
    "Marked partial",
    "mark partial"
  );

  const markPartialWithTime = () => {
    const n = parseInt(actualMinutes, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a positive number of minutes");
      return;
    }
    return writeStatusMaybeBranched(
      { status: ACTIVITY_STATUSES.PARTIAL, actual_duration_minutes: n },
      `Marked partial (${n}m)`,
      "mark partial"
    );
  };

  // Skipped / cancelled append a tagged resolution note to the existing
  // notes; the resolution note goes through the same text pipeline.
  const resolveWithNote = async (status, tag, successMsg, actionLabel) => {
    const note = await prepareNote(resolutionNote, "note");
    if (!note) return;
    const trimmed = note.prepared.content.trim();
    const baseNote = activity.notes || "";
    const merged = trimmed
      ? (baseNote ? `${baseNote}\n\n[${tag}] ${trimmed}` : `[${tag}] ${trimmed}`)
      : baseNote;
    return writeStatusMaybeBranched(
      { status, notes: merged || null, ...(trimmed ? note.authorPatch : {}) },
      successMsg,
      actionLabel,
      trimmed ? note.record : null
    );
  };

  const markSkipped = () => resolveWithNote(ACTIVITY_STATUSES.SKIPPED, "Skipped", "Marked skipped", "mark skipped");

  const markCancelled = () => resolveWithNote(ACTIVITY_STATUSES.CANCELLED, "Cancelled", "Cancelled", "cancel");

  const undo = () => writeStatusMaybeBranched(
    {
      status: ACTIVITY_STATUSES.SCHEDULED,
      actual_duration_minutes: null,
    },
    "Restored to scheduled",
    "restore"
  );

  const reschedule = async () => {
    if (!newDateTime) {
      toast.error(isQuickPlan ? "Pick a new date" : "Pick a new date and time");
      return;
    }
    let parsed;
    try {
      // Quick plans store the EOD sentinel (23:59) so they stay
      // "future" until the day fully passes and sort after timed
      // plans on the same day. Mirror what ActivityPlanModal does on
      // create.
      parsed = isQuickPlan
        ? new Date(`${newDateTime}T23:59:00`)
        : new Date(newDateTime);
    } catch { /* fallthrough */ }
    if (!parsed || Number.isNaN(parsed.getTime())) {
      toast.error(isQuickPlan ? "Invalid date" : "Invalid date/time");
      return;
    }
    const fromIso = activity.timestamp;
    const toIso = parsed.toISOString();
    if (fromIso && new Date(fromIso).getTime() === parsed.getTime()) {
      toast.error(isQuickPlan ? "Pick a different date" : "Pick a different time");
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
          <div className="text-[11px] text-primary bg-primary/10 border border-primary/30 rounded-md px-2 py-1.5">
            Recurring plan — you'll choose whether to apply this to just this instance, this and future, or every occurrence. Rescheduling only ever applies to this instance.
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
            <MentionTextarea
              value={resolutionNote}
              onChange={setResolutionNote}
              alters={alters}
              signposts
              placeholder="Optional note (why?)"
              className="text-sm min-h-[40px] resize-none"
              rows={1}
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
              type={isQuickPlan ? "date" : "datetime-local"}
              value={newDateTime}
              onChange={e => setNewDateTime(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
            {isQuickPlan && (
              <p className="text-[11px] text-muted-foreground">
                Quick plans are tied to a day, not a specific time.
              </p>
            )}
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
                    {isQuickPlan
                      ? `${format(new Date(h.from), "MMM d")} → ${format(new Date(h.to), "MMM d")}`
                      : `${format(new Date(h.from), "MMM d HH:mm")} → ${format(new Date(h.to), "MMM d HH:mm")}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Default view — action buttons */}
        {submode === null && (
          <div className="space-y-2">
            {/* Notes — editable for any plan/activity, saved on its own. */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <MentionTextarea
                value={noteDraft}
                onChange={setNoteDraft}
                alters={alters}
                signposts
                placeholder="Add a note for this plan…"
                className="text-sm min-h-[56px] resize-none"
              />
              {noteDraft.trim() !== (activity.notes || "").trim() && (
                <Button size="sm" variant="outline" onClick={saveNote} disabled={savingNote} className="w-full">
                  {savingNote ? "Saving…" : "Save note"}
                </Button>
              )}
            </div>
            {status === ACTIVITY_STATUSES.SCHEDULED && (
              <>
                {alreadyActive ? (
                  <div className="text-[11px] text-primary bg-primary/10 border border-primary/30 rounded-md px-2 py-1.5 flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 flex-shrink-0" /> In progress — finish it from Active Activities on the dashboard.
                  </div>
                ) : (
                  <Button variant="outline" className="w-full justify-start gap-2" disabled={saving} onClick={startActive}>
                    <Play className="w-4 h-4 text-primary" /> Start now (set active)
                  </Button>
                )}
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
      <RecurrenceBranchDialog
        isOpen={!!pendingBranchAction}
        actionLabel={pendingBranchAction?.actionLabel || "mark"}
        subject={activity?.activity_name || null}
        onClose={() => setPendingBranchAction(null)}
        onChoose={applyBranchChoice}
      />
    </Dialog>
  );
}
