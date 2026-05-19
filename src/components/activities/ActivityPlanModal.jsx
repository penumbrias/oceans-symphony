import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format, differenceInMinutes, addDays, addWeeks, addMonths } from "date-fns";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { Plus, MapPin, Zap, Repeat, Bell } from "lucide-react";
import { LEAD_STEPS, DEFAULT_LEAD_STEPS } from "@/lib/criticalPins";
import { useTerms } from "@/lib/useTerms";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";
import {
  PLAN_REMINDER_OFFSETS,
  readPlanRemindersEnabled,
  readPlanRemindersDefaultOffset,
  schedulePlanReminder,
} from "@/lib/planReminderScheduler";
import {
  RECURRENCE_BRANCHES,
  membersForBranch,
  applyEditToSeries,
  BRANCH_LABELS,
} from "@/lib/recurrenceUtils";

// "I'm scheduling this" modal — future-dated plan path.
//
// Phase 2 split from the old ActivityTimeRangeModal: this is the richer
// "Plan Activity" form. Carries title / location / critical flag /
// lead-step picker / task link / recurrence.
//
// Editing path:
//   - When `editingPlan` is set, the modal hydrates from that record.
//   - For records in a recurrence series, the caller should have already
//     resolved a `branch` ("this_only" / "this_and_future" / "all") via
//     RecurrenceBranchDialog. We honour it on save:
//        * THIS_ONLY: split the pivot off the series (clear group id),
//          mutate just that record.
//        * THIS_AND_FUTURE: applyEditToSeries to pivot + every later
//          record sharing the group id.
//        * ALL: applyEditToSeries to every record sharing the group id.

function toTimeString(date, hour, minute = 0) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return format(d, "HH:mm");
}

function parseTimeToDate(baseDate, timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

export default function ActivityPlanModal({
  isOpen,
  onClose,
  startDate: startDateProp,
  endDate: endDateProp,
  startHour,
  endHour,
  startMinute = 0,
  endMinute = 0,
  alters,
  frontingHistory = [],
  onSave,
  // Existing plan to edit. When set, fields hydrate from it and the
  // save path calls Activity.update instead of Activity.create.
  editingPlan = null,
  // Pre-resolved series-edit branch. Null for non-recurring or fresh-
  // create paths. Ignored when there's no recurrence_group_id on the
  // pivot — the helpers fall back to a single-record mutate.
  editBranch = null,
  // All activities — needed when editBranch is set so the helpers can
  // find the rest of the series.
  allActivities = null,
}) {
  const terms = useTerms();
  const queryClient = useQueryClient();

  // Default to tomorrow noon when there's no explicit start date.
  const defaultedStart = startDateProp || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d;
  })();

  const [datePicked, setDatePicked] = useState(() => format(defaultedStart, "yyyy-MM-dd"));
  const [endDatePicked, setEndDatePicked] = useState(() => format(endDateProp || defaultedStart, "yyyy-MM-dd"));
  const startDate = datePicked ? new Date(`${datePicked}T00:00:00`) : defaultedStart;
  const endDate = endDatePicked ? new Date(`${endDatePicked}T00:00:00`) : startDate;
  const isCrossDay = startDate && endDate && format(startDate, "yyyy-MM-dd") !== format(endDate, "yyyy-MM-dd");

  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [startTime, setStartTime] = useState(() => toTimeString(defaultedStart, 12, 0));
  const [endTime, setEndTime] = useState(() => toTimeString(defaultedStart, 13, 0));
  // Quick plan: a date-only plan with no specific time. Renders as a
  // pill at the top of the day column on the grid instead of in a
  // time cell. Toggle hides the time inputs entirely; on save, the
  // timestamp is midnight of the picked date and is_quick_plan: true.
  const [isQuickPlan, setIsQuickPlan] = useState(() => !!editingPlan?.is_quick_plan);
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [isCritical, setIsCritical] = useState(false);
  const [leadSteps, setLeadSteps] = useState(DEFAULT_LEAD_STEPS);
  const [recurrenceInterval, setRecurrenceInterval] = useState("none");
  const [recurrenceCount, setRecurrenceCount] = useState(8);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  const [newActivityName, setNewActivityName] = useState("");
  const [showNewActivity, setShowNewActivity] = useState(false);

  // Per-plan reminder override. `null` = use the global default
  // (from Settings → Reminders). Saved to Activity.reminder_offset_minutes.
  // The picker only opens once the user has switched the global toggle
  // on — otherwise scheduling a per-plan override would silently
  // produce no notifications.
  const [reminderOffset, setReminderOffset] = useState(null);
  const planRemindersEnabledGlobal = readPlanRemindersEnabled();
  const planRemindersDefault = readPlanRemindersDefaultOffset();

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  // Hydrate from props / editingPlan on open.
  useEffect(() => {
    if (!isOpen) return;
    if (editingPlan) {
      const ts = new Date(editingPlan.timestamp);
      const endTs = editingPlan.duration_minutes
        ? new Date(ts.getTime() + editingPlan.duration_minutes * 60_000)
        : null;
      setDatePicked(format(ts, "yyyy-MM-dd"));
      setEndDatePicked(format(endTs || ts, "yyyy-MM-dd"));
      setStartTime(format(ts, "HH:mm"));
      setEndTime(endTs ? format(endTs, "HH:mm") : "");
      setSelectedActivityCategories(editingPlan.activity_category_ids || []);
      setSelectedAlters(
        editingPlan.assigned_alter_ids?.length
          ? editingPlan.assigned_alter_ids
          : (editingPlan.fronting_alter_ids || [])
      );
      setNotes(editingPlan.notes || "");
      setTitle((editingPlan.activity_category_ids || []).length === 0 ? (editingPlan.activity_name || "") : "");
      setLocation(editingPlan.location || "");
      setIsCritical(!!editingPlan.is_critical);
      setLeadSteps(editingPlan.critical_lead_steps || DEFAULT_LEAD_STEPS);
      setSelectedTaskId(editingPlan.task_id || null);
      setReminderOffset(editingPlan.reminder_offset_minutes ?? null);
      // Recurrence interval is metadata on existing records; we don't
      // let the user change the cadence from the edit dialog. Reset
      // local controls so they aren't visible during edit.
      setRecurrenceInterval("none");
      setRecurrenceCount(8);
      return;
    }
    if (startDateProp) {
      setDatePicked(format(startDateProp, "yyyy-MM-dd"));
      setEndDatePicked(format(endDateProp || startDateProp, "yyyy-MM-dd"));
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(12, 0, 0, 0);
      setDatePicked(format(d, "yyyy-MM-dd"));
      setEndDatePicked(format(d, "yyyy-MM-dd"));
    }
    if (startDateProp && startHour !== undefined) {
      setStartTime(toTimeString(startDateProp, startHour, startMinute));
      if (endHour != null) {
        setEndTime(toTimeString(endDateProp || startDateProp, endHour, endMinute));
      } else {
        setEndTime("");
      }
    } else {
      setStartTime("12:00");
      setEndTime("13:00");
    }
    setSelectedActivityCategories([]);
    setSelectedAlters([]);
    setNotes("");
    setTitle("");
    setLocation("");
    setIsCritical(false);
    setLeadSteps(DEFAULT_LEAD_STEPS);
    setSelectedTaskId(null);
    setRecurrenceInterval("none");
    setRecurrenceCount(8);
    setReminderOffset(null);
  }, [isOpen, editingPlan, startDateProp, endDateProp, startHour, endHour, startMinute, endMinute]);

  // Auto-populate alters from fronting history when picking a slot for
  // a brand-new plan. Skipped when editing (the record's own alters win).
  const startDateKey = startDate ? format(startDate, "yyyy-MM-dd") : null;
  useEffect(() => {
    if (editingPlan) return;
    if (startDate && startHour !== undefined && endHour !== undefined) {
      const startDt = new Date(startDate);
      startDt.setHours(Math.min(startHour, endHour), startMinute, 0, 0);
      const endDt = new Date(startDate);
      endDt.setHours(Math.max(startHour, endHour) + 1, endMinute, 0, 0);
      const relevantSessions = (frontingHistory || []).filter((s) => {
        const ss = new Date(s.start_time);
        const se = s.end_time ? new Date(s.end_time) : new Date();
        return ss < endDt && se > startDt;
      });
      const alterIds = new Set();
      relevantSessions.forEach((s) => {
        if (s.primary_alter_id) alterIds.add(s.primary_alter_id);
        if (s.alter_id) alterIds.add(s.alter_id);
        (s.co_fronter_ids || []).forEach((id) => alterIds.add(id));
      });
      setSelectedAlters(Array.from(alterIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateKey, startHour, endHour, startMinute, endMinute, frontingHistory, editingPlan]);

  const durationMinutes = useMemo(() => {
    if (!startDate || !startTime || !endTime) return 0;
    const s = parseTimeToDate(startDate, startTime);
    const e = parseTimeToDate(endDate || startDate, endTime);
    const diff = differenceInMinutes(e, s);
    return diff > 0 ? diff : 0;
  }, [startDate, endDate, startTime, endTime]);

  const handleToggleAlter = (alterId) => {
    setSelectedAlters((prev) =>
      prev.includes(alterId) ? prev.filter((id) => id !== alterId) : [...prev, alterId]
    );
  };

  const handleCreateNewActivity = async () => {
    if (!newActivityName.trim()) return;
    const newCat = await base44.entities.ActivityCategory.create({
      name: newActivityName.trim(),
      color: "#8b5cf6",
      parent_category_id: null,
    });
    queryClient.invalidateQueries({ queryKey: ["activityCategories"] });
    setSelectedActivityCategories((prev) => [...prev, newCat.id]);
    setNewActivityName("");
    setShowNewActivity(false);
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const linkedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : null;

    // Plan mode: any ONE of (title, activity category, linked to-do) is enough.
    if (selectedActivityCategories.length === 0 && !trimmedTitle && !linkedTask) {
      toast.error("Add a title, pick an activity, or link a to-do");
      return;
    }
    if (!isQuickPlan && !startTime) { toast.error("Set start time"); return; }
    if (!isQuickPlan && endTime && durationMinutes <= 0) { toast.error("End time must be after start time"); return; }

    setIsLoading(true);
    // Quick plans drop the time entirely. We store the timestamp as
    // end-of-day so the plan stays "in the future" (and therefore
    // visible in Upcoming Plans) until the day fully passes, and so
    // sorting by timestamp places it after timed plans on the same
    // day. The grid uses the is_quick_plan flag to render quick
    // plans as overlay pills rather than placing them in an hour
    // row, so the actual time-of-day on the timestamp is never
    // displayed.
    const timestamp = isQuickPlan
      ? new Date(`${format(startDate, "yyyy-MM-dd")}T23:59:00`)
      : parseTimeToDate(startDate, startTime);
    const endDt = isQuickPlan
      ? null
      : (endTime ? parseTimeToDate(endDate || startDate, endTime) : null);

    try {
      const catById = Object.fromEntries(activityCategories.map((c) => [c.id, c]));
      const isPlanned = timestamp.getTime() > Date.now();

      // ── Edit existing plan ──────────────────────────────────────────
      if (editingPlan) {
        const firstCatId = selectedActivityCategories[0];
        const firstCat = firstCatId ? catById[firstCatId] : null;
        const fallbackName = trimmedTitle || linkedTask?.title || firstCat?.name || editingPlan.activity_name || "";
        const prevTs = editingPlan.timestamp;
        const prevStatus = editingPlan.status;
        let nextStatus = prevStatus;
        if (!prevStatus) {
          nextStatus = isPlanned ? ACTIVITY_STATUSES.SCHEDULED : ACTIVITY_STATUSES.LOGGED;
        } else if (prevStatus === ACTIVITY_STATUSES.SCHEDULED && !isPlanned) {
          nextStatus = ACTIVITY_STATUSES.SCHEDULED;
        }
        const rescheduled = prevTs && new Date(prevTs).getTime() !== timestamp.getTime();
        const nextHistory = rescheduled
          ? [
              ...(editingPlan.reschedule_history || []),
              { from: prevTs, to: timestamp.toISOString(), rescheduled_at: new Date().toISOString() },
            ]
          : (editingPlan.reschedule_history || []);

        const editsCommon = {
          activity_name: fallbackName,
          activity_category_ids: selectedActivityCategories,
          ...(firstCat?.color ? { color: firstCat.color } : {}),
          task_id: linkedTask?.id || null,
          duration_minutes: isQuickPlan ? null : (durationMinutes > 0 ? durationMinutes : null),
          fronting_alter_ids: selectedAlters,
          notes: notes || null,
          location: location.trim() || null,
          is_planned: isPlanned,
          is_quick_plan: isQuickPlan,
          is_critical: !!isCritical,
          critical_lead_steps: isCritical ? leadSteps : null,
          assigned_alter_ids: isPlanned ? selectedAlters : [],
          reminder_offset_minutes: reminderOffset,
        };

        const groupId = editingPlan.recurrence_group_id;
        const branch = groupId ? editBranch : null;

        if (branch === RECURRENCE_BRANCHES.THIS_AND_FUTURE || branch === RECURRENCE_BRANCHES.ALL) {
          // Apply non-time-shifting edits to every record in the slice.
          // We deliberately don't mutate timestamps for the rest of the
          // series — moving each instance by the same delta is a Phase 3
          // call (audit trail confusion). Just mutate this pivot's
          // timestamp + reschedule history; siblings keep their times.
          const members = membersForBranch(allActivities || [], editingPlan, branch);
          // Edit applied to siblings excludes the time/reschedule fields.
          const siblingEdits = {
            ...editsCommon,
            status: nextStatus,
          };
          const siblings = members.filter((m) => m.id !== editingPlan.id);
          await applyEditToSeries(siblings, siblingEdits);
          // Pivot gets time + reschedule.
          await base44.entities.Activity.update(editingPlan.id, {
            ...editsCommon,
            timestamp: timestamp.toISOString(),
            status: nextStatus,
            reschedule_history: nextHistory,
          });
          toast.success(`Updated ${BRANCH_LABELS[branch]} (${members.length})`);
        } else if (branch === RECURRENCE_BRANCHES.THIS_ONLY) {
          // Split this record off the series so subsequent edits don't
          // sweep it back in.
          await base44.entities.Activity.update(editingPlan.id, {
            ...editsCommon,
            timestamp: timestamp.toISOString(),
            status: nextStatus,
            reschedule_history: nextHistory,
            recurrence_group_id: null,
            recurrence_interval: null,
          });
          toast.success("Updated this instance");
        } else {
          // Plain single-record edit.
          await base44.entities.Activity.update(editingPlan.id, {
            ...editsCommon,
            timestamp: timestamp.toISOString(),
            status: nextStatus,
            reschedule_history: nextHistory,
          });
          toast.success("Plan updated");
        }

        if (linkedTask) {
          try {
            const dueDateStr = format(timestamp, "yyyy-MM-dd");
            if (linkedTask.due_date !== dueDateStr) {
              await base44.entities.Task.update(linkedTask.id, { due_date: dueDateStr });
              queryClient.invalidateQueries({ queryKey: ["tasks"] });
            }
          } catch { /* non-fatal */ }
        }
        queryClient.invalidateQueries({ queryKey: ["activities"] });
        onSave?.();
        onClose?.();
        setIsLoading(false);
        return;
      }

      // ── Create new (single or recurring) ────────────────────────────
      const fallbackName = trimmedTitle || linkedTask?.title || "";
      const records = selectedActivityCategories.length > 0
        ? selectedActivityCategories.map((catId) => {
            const cat = catById[catId];
            return {
              activity_name: fallbackName || (cat?.name || catId),
              activity_category_ids: [catId],
              color: cat?.color,
            };
          })
        : [{ activity_name: fallbackName, activity_category_ids: [], color: undefined }];

      const recurrenceGroupId =
        recurrenceInterval !== "none"
          ? `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          : null;
      const advance = (d, n) => {
        if (recurrenceInterval === "daily") return addDays(d, n);
        if (recurrenceInterval === "weekly") return addWeeks(d, n);
        if (recurrenceInterval === "biweekly") return addWeeks(d, n * 2);
        if (recurrenceInterval === "monthly") return addMonths(d, n);
        return d;
      };
      const occurrences = recurrenceGroupId
        ? Array.from({ length: Math.max(1, Math.min(52, recurrenceCount)) }, (_, i) => advance(timestamp, i))
        : [timestamp];

      for (const occurrence of occurrences) {
        const occurrenceIsPlanned = occurrence.getTime() > Date.now();
        for (const r of records) {
          await base44.entities.Activity.create({
            timestamp: occurrence.toISOString(),
            activity_name: r.activity_name,
            activity_category_ids: r.activity_category_ids,
            ...(r.color ? { color: r.color } : {}),
            task_id: linkedTask?.id || null,
            duration_minutes: isQuickPlan ? null : (durationMinutes > 0 ? durationMinutes : null),
            fronting_alter_ids: selectedAlters,
            notes: notes || null,
            location: location.trim() || null,
            is_planned: occurrenceIsPlanned,
            is_quick_plan: isQuickPlan,
            is_critical: isCritical ? true : false,
            critical_lead_steps: isCritical ? leadSteps : null,
            recurrence_group_id: recurrenceGroupId,
            recurrence_interval: recurrenceGroupId ? recurrenceInterval : null,
            assigned_alter_ids: occurrenceIsPlanned ? selectedAlters : [],
            status: occurrenceIsPlanned ? ACTIVITY_STATUSES.SCHEDULED : ACTIVITY_STATUSES.LOGGED,
            actual_duration_minutes: null,
            reschedule_history: [],
            reminder_offset_minutes: reminderOffset,
          });
        }
      }

      if (linkedTask) {
        try {
          const dueDateStr = format(timestamp, "yyyy-MM-dd");
          if (linkedTask.due_date !== dueDateStr) {
            await base44.entities.Task.update(linkedTask.id, { due_date: dueDateStr });
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
          }
        } catch { /* non-fatal */ }
      }

      // No fronting-session updates here — plan-mode plans are future-
      // dated, so the alter isn't actually fronting yet. assigned_alter_ids
      // carries the intent; the per-alter "Plans for me" surface uses it.

      setSelectedActivityCategories([]);
      setNotes("");
      setTitle("");
      setLocation("");
      setIsCritical(false);
      setLeadSteps(DEFAULT_LEAD_STEPS);
      onSave?.();
      onClose();
      toast.success(
        recurrenceGroupId
          ? `Plan saved — ${occurrences.length} occurrences scheduled.`
          : "Plan saved!"
      );
    } catch (err) {
      toast.error(err.message || "Failed to save plan");
    } finally {
      setIsLoading(false);
    }
  };

  // Visible badge when editing a recurring plan so the user can see
  // which branch their save will apply to. Pure visual confirmation —
  // the choice was already made in RecurrenceBranchDialog.
  const branchBadge = (editingPlan?.recurrence_group_id && editBranch) ? (
    <div className="text-[11px] text-primary bg-primary/10 border border-primary/30 rounded-md px-2 py-1.5">
      Editing <strong>{BRANCH_LABELS[editBranch]}</strong> in this recurring series.
    </div>
  ) : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingPlan ? "Edit Plan" : "Plan Activity"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {branchBadge}

          {/* Date pickers */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">Date</label>
              <input
                type="date"
                value={datePicked}
                onChange={(e) => {
                  setDatePicked(e.target.value);
                  if (!endDatePicked || endDatePicked < e.target.value) setEndDatePicked(e.target.value);
                }}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">
                End date <span className="text-xs text-muted-foreground">(optional)</span>
              </label>
              <input
                type="date"
                value={endDatePicked}
                min={datePicked}
                onChange={(e) => setEndDatePicked(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
          </div>

          {/* Quick plan toggle — when on, hides the time inputs.
              Quick plans render as pills above the day column on the
              grid instead of in a specific time row. Useful for
              "I want to do X today but don't care when". */}
          <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-border/40 px-3 py-2 hover:bg-muted/20 transition-colors">
            <input
              type="checkbox"
              checked={isQuickPlan}
              onChange={(e) => setIsQuickPlan(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm font-medium">Quick plan (date only, no specific time)</span>
          </label>

          {/* Start / end time — hidden for quick plans */}
          {!isQuickPlan && (
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">
                End time
                {isCrossDay && endDate && (
                  <span className="ml-1 text-xs text-primary font-normal">{format(endDate, "MMM d")}</span>
                )}
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
            {durationMinutes > 0 && (
              <div className="text-xs text-muted-foreground pb-2 whitespace-nowrap">
                {durationMinutes >= 60
                  ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60 > 0 ? durationMinutes % 60 + "m" : ""}`
                  : `${durationMinutes}m`}
              </div>
            )}
          </div>
          )}

          {/* Title */}
          <div>
            <label className="text-sm font-medium block mb-1">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Doctor's appointment, school pickup, etc."
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional — you only need <strong>one</strong> of: a title, an activity category (below), or a linked to-do. Combine them however you like.
            </p>
          </div>

          {/* Link a to-do */}
          <div>
            <label className="text-sm font-medium block mb-1">
              Link to a to-do <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <select
              value={selectedTaskId || ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setSelectedTaskId(v);
                if (v && !title.trim()) {
                  const t = tasks.find((x) => x.id === v);
                  if (t?.title) setTitle(t.title);
                }
              }}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">— No to-do linked —</option>
              {tasks.filter((t) => !t.completed).map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Pick an existing to-do to schedule it for this time. Its due date will update to match.
            </p>
          </div>

          {/* Location */}
          <div>
            <label className="text-sm font-medium flex items-center gap-1 mb-1">
              <MapPin className="w-3.5 h-3.5" /> Location <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Westside Clinic, kitchen, anywhere"
              className="text-sm"
            />
          </div>

          {/* Recurrence — create-time only; editing one instance of a series
              doesn't change cadence. The branch chooser handles series scope
              before we get here. */}
          {!editingPlan && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Repeat className={`w-4 h-4 ${recurrenceInterval !== "none" ? "text-primary" : "text-muted-foreground"}`} />
                <span>Repeat</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "none", label: "None" },
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                  { value: "biweekly", label: "Every 2 weeks" },
                  { value: "monthly", label: "Monthly" },
                ].map((opt) => {
                  const active = recurrenceInterval === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRecurrenceInterval(opt.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {recurrenceInterval !== "none" && (
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-xs text-muted-foreground">How many occurrences?</label>
                  <Input
                    type="number"
                    min={1}
                    max={52}
                    value={recurrenceCount}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setRecurrenceCount(Number.isFinite(n) ? Math.max(1, Math.min(52, n)) : 1);
                    }}
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">(max 52)</span>
                </div>
              )}
            </div>
          )}

          {/* Reminder */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Bell className={`w-4 h-4 ${reminderOffset != null ? "text-primary" : "text-muted-foreground"}`} />
              <span>Reminder</span>
            </div>
            {planRemindersEnabledGlobal ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Default for this plan is {planRemindersDefault < 60
                    ? `${planRemindersDefault} minutes`
                    : planRemindersDefault < 1440
                      ? `${Math.round(planRemindersDefault / 60)} hour${planRemindersDefault >= 120 ? "s" : ""}`
                      : "1 day"} before. Override here if you want a different lead time for this one.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReminderOffset(null)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${reminderOffset == null ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
                  >Use default</button>
                  {PLAN_REMINDER_OFFSETS.map((opt) => {
                    const active = reminderOffset === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setReminderOffset(opt.value)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
                      >{opt.label}</button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Plan reminders are off globally. Turn them on in Settings → Reminders to get a notification before this plan starts.
              </p>
            )}
          </div>

          {/* Critical + lead-steps */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <button
              type="button"
              onClick={() => setIsCritical((v) => !v)}
              className={`w-full flex items-center justify-between gap-2 text-sm font-medium transition-colors ${isCritical ? "text-amber-500" : "text-foreground"}`}
            >
              <span className="flex items-center gap-1.5">
                <Zap className={`w-4 h-4 ${isCritical ? "fill-amber-500 text-amber-500" : ""}`} />
                Mark as critical
              </span>
              <span className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${isCritical ? "bg-amber-500" : "bg-muted-foreground/30"}`}>
                <span className={`w-4 h-4 rounded-full bg-background transition-transform ${isCritical ? "translate-x-4" : "translate-x-0"}`} />
              </span>
            </button>
            {isCritical && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Pin to the top of the Dashboard:</p>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STEPS.map((step) => {
                    const active = leadSteps.includes(step.key);
                    return (
                      <button
                        key={step.key}
                        type="button"
                        onClick={() => setLeadSteps((prev) => active ? prev.filter((k) => k !== step.key) : [...prev, step.key])}
                        className={`text-xs px-2 py-1 rounded-full border transition-all ${active ? "border-amber-500/50 bg-amber-500/10 text-amber-500" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
                      >
                        {step.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Activities */}
          <ActivityPillSelector
            selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
          />

          {showNewActivity ? (
            <div className="space-y-2">
              <Input
                placeholder="Activity name..."
                value={newActivityName}
                onChange={(e) => setNewActivityName(e.target.value)}
                className="text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => { setShowNewActivity(false); setNewActivityName(""); }}
                  className="flex-1">Cancel</Button>
                <Button size="sm" onClick={handleCreateNewActivity}
                  disabled={!newActivityName.trim()} className="flex-1">Add</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewActivity(true)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" /> Create new activity
            </button>
          )}

          {/* Alters */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Who was {terms.fronting}?
              {selectedAlters.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  ({selectedAlters.length} selected)
                </span>
              )}
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3 bg-muted/20">
              {alters.map((alter) => (
                <div key={alter.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedAlters.includes(alter.id)}
                    onCheckedChange={() => handleToggleAlter(alter.id)}
                    id={`plan-alter-${alter.id}`}
                  />
                  <label htmlFor={`plan-alter-${alter.id}`} className="text-sm cursor-pointer flex-1">
                    {alter.alias || alter.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground">Description / notes — Optional</label>
            <MentionTextarea
              value={notes}
              onChange={setNotes}
              alters={alters || []}
              placeholder="Extra context: what, why, who's coming, anything to remember…"
              className="mt-1 h-20"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Plan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
