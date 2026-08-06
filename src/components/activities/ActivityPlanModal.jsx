import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createPlan } from "@/lib/planCreate";
import { format, differenceInMinutes, addDays, addWeeks, addMonths } from "date-fns";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { applyWhisper } from "@/lib/whisperUtils";
import { applyLogCommands } from "@/lib/logCommands";
import { Plus, MapPin, Zap, Repeat, Bell, UserPlus, X } from "lucide-react";
import { LEAD_STEPS, DEFAULT_LEAD_STEPS } from "@/lib/criticalPins";
import { useTerms } from "@/lib/useTerms";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";
import {
  PLAN_REMINDER_OFFSETS,
  readPlanRemindersEnabled,
  readPlanRemindersDefaultOffset,
  writePlanRemindersEnabled,
} from "@/lib/planReminderScheduler";
import { isNative } from "@/lib/platform";
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

// Compact selected-alter chip (avatar + label + remove) — same shape as
// the Log Activity modal so the "who's this for" picker looks identical
// across the activity modals.
function SelectedFronterChip({ alter, label, onRemove }) {
  const avatar = useResolvedAvatarUrl(alter?.avatar_url);
  return (
    <span className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-full border border-border bg-muted/30 text-xs">
      <span className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center text-[0.5625rem] text-white flex-shrink-0" style={{ backgroundColor: alter?.color || "#8b5cf6" }}>
        {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : (alter?.name?.[0]?.toUpperCase() || "?")}
      </span>
      <span className="truncate max-w-[140px]">{label}</span>
      <button type="button" onClick={onRemove} aria-label="Remove" className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
    </span>
  );
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
  // Carried over from the quick composer's "More options" so continuing
  // into the full form doesn't mean retyping what you already wrote.
  initialTitle = "",
  initialNotes = "",
}) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const formatAlter = useAlterLabel();
  const [fronterPickerOpen, setFronterPickerOpen] = useState(false);
  const altersById = useMemo(
    () => Object.fromEntries((alters || []).map((a) => [a.id, a])),
    [alters]
  );

  // Default to tomorrow noon when there's no explicit start date.
  // Quick plans get a separate today-snap path (see the open useEffect
  // below) so making several quick plans in succession doesn't require
  // re-toggling the quick-plan checkbox to roll the date back to today.
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
  // When true, save also creates a new Task derived from this plan
  // (title / due-date) and links it. Mutually exclusive with picking
  // an existing to-do from the dropdown.
  const [createTodo, setCreateTodo] = useState(false);

  const [newActivityName, setNewActivityName] = useState("");
  const [showNewActivity, setShowNewActivity] = useState(false);

  // Per-plan reminder override. `null` = use the global default
  // (from Settings → Reminders). Saved to Activity.reminder_offset_minutes.
  // The picker only opens once the user has switched the global toggle
  // on — otherwise scheduling a per-plan override would silently
  // produce no notifications.
  const [reminderOffset, setReminderOffset] = useState(null);

  // v0.88.5 layout revamp: optional fields (location / to-do link / who /
  // notes) hide behind "+ chips" until used, so the default modal is a
  // third the height. Purely presentational — expanded automatically
  // whenever the field HAS a value (editing an existing plan), so nothing
  // is ever hidden-while-set.
  const [showLocationField, setShowLocationField] = useState(false);
  const [showTodoField, setShowTodoField] = useState(false);
  const [showWhoField, setShowWhoField] = useState(false);
  const [showNotesField, setShowNotesField] = useState(false);
  const locationOpen = showLocationField || !!location;
  const todoOpen = showTodoField || !!selectedTaskId || createTodo;
  const whoOpen = showWhoField || selectedAlters.length > 0;
  const notesOpen = showNotesField || !!notes;
  // v0.88.6: state (not a bare read) so the inline "Turn on" button can
  // flip the global setting without leaving the modal (tester: "why have
  // to go to the settings page?").
  const [planRemindersEnabledGlobal, setPlanRemindersEnabledGlobal] = useState(() => readPlanRemindersEnabled());
  const planRemindersDefault = readPlanRemindersDefaultOffset();
  const enablePlanRemindersInline = async () => {
    writePlanRemindersEnabled(true);
    setPlanRemindersEnabledGlobal(true);
    // Best-effort permission ask right away — a granted permission is the
    // other half of actually receiving the notification.
    try {
      if (isNative()) {
        const { requestNativePermission } = await import("@/lib/nativeNotifications");
        await requestNativePermission();
      } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch { /* permission ask is best-effort */ }
    toast.success("Plan reminders on — set the lead time below");
  };

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  // v0.88.6: title ↔ activity auto-detect. When the typed title exactly
  // matches an activity category (case-insensitive) that isn't already
  // selected, offer a one-tap "use the activity instead" suggestion.
  // NON-FORCING: dismissing it (or ignoring it) keeps the word as a plain
  // title — for the "I want to title it 'work' without logging the Work
  // activity" case.
  const [dismissedTitleSuggestion, setDismissedTitleSuggestion] = useState("");
  const titleActivityMatch = useMemo(() => {
    const q = title.trim().toLowerCase();
    if (!q || q === dismissedTitleSuggestion) return null;
    return activityCategories.find(
      (c) => (c.name || "").trim().toLowerCase() === q && !selectedActivityCategories.includes(c.id)
    ) || null;
  }, [title, dismissedTitleSuggestion, activityCategories, selectedActivityCategories]);

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
      // Default to tomorrow noon — UNLESS the quick-plan toggle is
      // already on (e.g. carried over from the previous time the user
      // opened this modal). Quick plans are conceptually "today" things;
      // forcing the user to re-toggle the checkbox just to roll the
      // date back was the source of the "I keep changing the date back"
      // complaint that prompted this branch.
      const d = new Date();
      if (!isQuickPlan) d.setDate(d.getDate() + 1);
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
    setNotes(initialNotes || "");
    setTitle(initialTitle || "");
    setLocation("");
    setIsCritical(false);
    setLeadSteps(DEFAULT_LEAD_STEPS);
    setSelectedTaskId(null);
    setCreateTodo(false);
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

    // Run inline ~commands first (each becomes a chip), then whisper handling.
    const lc = await applyLogCommands(notes || "", { isRich: false });
    // "/w @name [secret]" in the notes hides that part behind a whisper bar
    // (no brackets warns first — a plan note is a personal record). Done
    // before setIsLoading so a "go back" leaves the form untouched.
    const w = applyWhisper(lc.content, alters || [], { allowWholeBlur: false, rich: lc.logged.length > 0, surfaceLabel: "plan" });
    if (w === null) return;
    const finalNotes = w.content;

    setIsLoading(true);

    // "Create a new to-do from this plan" toggle. We build the Task
    // up-front so its id can flow into `task_id` on every Activity
    // record we're about to write (including recurring occurrences),
    // and so the existing helper that updates the due_date on save
    // continues to work without a special-case.
    let derivedTask = null;

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

      if (createTodo && !linkedTask) {
        const firstCatId = selectedActivityCategories[0];
        const firstCat = firstCatId ? catById[firstCatId] : null;
        const todoTitle = trimmedTitle || firstCat?.name || "Plan to-do";
        try {
          derivedTask = await base44.entities.Task.create({
            title: todoTitle,
            completed: false,
            priority: "medium",
            due_date: format(timestamp, "yyyy-MM-dd"),
            notes: finalNotes || null,
          });
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        } catch (err) {
          toast.error(err?.message || "Couldn't create the linked to-do");
          setIsLoading(false);
          return;
        }
      }
      const effectiveLinkedTask = linkedTask || derivedTask;

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
          task_id: effectiveLinkedTask?.id || null,
          duration_minutes: isQuickPlan ? null : (durationMinutes > 0 ? durationMinutes : null),
          fronting_alter_ids: selectedAlters,
          notes: finalNotes || null,
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
          // Non-time-dependent edits apply uniformly; the time-dependent
          // fields (is_planned / assigned_alter_ids / status) are recomputed
          // PER SIBLING from its own timestamp — otherwise the edited
          // occurrence's planned/logged state would be forced onto siblings
          // whose own dates are in the past (or future). Resolved statuses
          // (done/partial/skipped/cancelled) on a sibling are preserved.
          const { is_planned: _ip, assigned_alter_ids: _aa, ...commonNoTime } = editsCommon;
          const siblings = members.filter((m) => m.id !== editingPlan.id);
          await applyEditToSeries(siblings, (m) => {
            const sibTs = m.timestamp ? new Date(m.timestamp).getTime() : 0;
            const sibPlanned = sibTs > Date.now();
            let sibStatus = m.status;
            if (!sibStatus || sibStatus === ACTIVITY_STATUSES.SCHEDULED || sibStatus === ACTIVITY_STATUSES.LOGGED) {
              sibStatus = sibPlanned ? ACTIVITY_STATUSES.SCHEDULED : ACTIVITY_STATUSES.LOGGED;
            }
            return {
              ...commonNoTime,
              is_planned: sibPlanned,
              assigned_alter_ids: sibPlanned ? selectedAlters : [],
              status: sibStatus,
            };
          });
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

      // ONE plan-create path (lib/planCreate.js) — shared with
      // QuickPlanComposer. Also adopts the composer's quick-plan rule: a
      // quick plan dated today stays a PLAN even if its time has passed
      // (this modal used to silently log it).
      const { occurrences, recurrenceGroupId } = await createPlan({
        records,
        timestamp,
        durationMinutes: durationMinutes > 0 ? durationMinutes : null,
        alterIds: selectedAlters,
        notes: finalNotes,
        location,
        isQuickPlan,
        isCritical,
        leadSteps,
        reminderOffset,
        recurrence: { interval: recurrenceInterval, count: recurrenceCount },
        // The modal already built its derived task up-front (shared with the
        // edit branch) — pass it as the linked task so createPlan links it
        // to every occurrence without creating a second one.
        linkedTask: effectiveLinkedTask,
        createTodo: false,
      });
      if (effectiveLinkedTask) queryClient.invalidateQueries({ queryKey: ["tasks"] });

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
      const todoSuffix = derivedTask ? " · to-do created" : "";
      toast.success(
        recurrenceGroupId
          ? `Plan saved — ${occurrences.length} occurrences scheduled${todoSuffix}.`
          : `Plan saved${todoSuffix}!`
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

        <div className="space-y-5">
          {branchBadge}

          {/* ── Title first (calendar-app convention) — borderless, large,
                 so the modal opens on "what is this plan" not on plumbing. */}
          <div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a title…"
              className="w-full bg-transparent border-0 border-b border-border/60 focus:border-primary rounded-none px-0 py-1.5 text-base font-medium focus:outline-none placeholder:text-muted-foreground/60 placeholder:font-normal transition-colors"
            />
            {titleActivityMatch ? (
              /* Title matches an activity category — offer to use the
                 activity instead (one tap), or dismiss to keep the word
                 as a plain title. */
              <div className="flex items-center gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedActivityCategories((prev) => [...prev, titleActivityMatch.id]);
                    setTitle("");
                  }}
                  className="text-xs px-2.5 py-1 rounded-full border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: titleActivityMatch.color || "#8b5cf6" }} />
                  Use activity “{titleActivityMatch.name}” instead
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedTitleSuggestion(title.trim().toLowerCase())}
                  aria-label="Keep as a plain title"
                  title="Keep as a plain title"
                  className="p-1 rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-[0.6875rem] text-muted-foreground mt-1">
                Optional — a title, an activity (below), or a linked to-do is enough.
              </p>
            )}
          </div>

          {/* ── WHEN ─────────────────────────────────────────────── */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">When</h3>
              {/* Quick plan = "date only, no time" — a small pill toggle
                  instead of the old full-width checkbox row. */}
              <button
                type="button"
                onClick={() => {
                  const checked = !isQuickPlan;
                  setIsQuickPlan(checked);
                  // Flipping quick-plan on snaps the date to today (the
                  // timed-plan default rolls into tomorrow late at night,
                  // which isn't what "do X today, whenever" means).
                  if (checked) {
                    const todayStr = format(new Date(), "yyyy-MM-dd");
                    setDatePicked(todayStr);
                    setEndDatePicked(todayStr);
                  }
                }}
                aria-pressed={isQuickPlan}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${isQuickPlan ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
              >
                No specific time
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground block mb-1">Date</label>
                <input
                  type="date"
                  value={datePicked}
                  onChange={(e) => {
                    setDatePicked(e.target.value);
                    if (!endDatePicked || endDatePicked < e.target.value) setEndDatePicked(e.target.value);
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground block mb-1">End date</label>
                <input
                  type="date"
                  value={endDatePicked}
                  min={datePicked}
                  onChange={(e) => setEndDatePicked(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                />
              </div>
            </div>
            {!isQuickPlan && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 flex items-center justify-between gap-2">
                    <span>Start</span>
                    <button type="button" onClick={() => { const n = new Date(); setDatePicked(format(n, "yyyy-MM-dd")); setStartTime(format(n, "HH:mm")); }}
                      className="text-[0.6875rem] text-primary hover:underline">Now</button>
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 flex items-center justify-between gap-2">
                    <span>
                      End
                      {isCrossDay && endDate && (
                        <span className="ml-1 text-primary">{format(endDate, "MMM d")}</span>
                      )}
                    </span>
                    <button type="button" onClick={() => { const n = new Date(); setEndDatePicked(format(n, "yyyy-MM-dd")); setEndTime(format(n, "HH:mm")); }}
                      className="text-[0.6875rem] text-primary hover:underline">Now</button>
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                  />
                </div>
                {durationMinutes > 0 && (
                  <div className="text-xs text-muted-foreground pb-2.5 whitespace-nowrap tabular-nums">
                    {durationMinutes >= 60
                      ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60 > 0 ? durationMinutes % 60 + "m" : ""}`
                      : `${durationMinutes}m`}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── WHAT ─────────────────────────────────────────────── */}
          <section className="space-y-2.5">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">What</h3>
            <ActivityPillSelector
              selectedActivities={selectedActivityCategories}
              onActivityChange={setSelectedActivityCategories}
              allowCreate={false}
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
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Create new activity
              </button>
            )}
          </section>

          {/* ── DETAILS — optional fields behind "+ chips" so the default
                 modal stays short. A field auto-expands whenever it holds a
                 value (editing), so nothing set is ever hidden. */}
          <section className="space-y-2.5">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Details</h3>
            {!(locationOpen && todoOpen && whoOpen && notesOpen) && (
              <div className="flex flex-wrap gap-1.5">
                {!locationOpen && (
                  <button type="button" onClick={() => setShowLocationField(true)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Location
                  </button>
                )}
                {!todoOpen && (
                  <button type="button" onClick={() => setShowTodoField(true)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Link a to-do
                  </button>
                )}
                {!whoOpen && (
                  <button type="button" onClick={() => setShowWhoField(true)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Who's it for
                  </button>
                )}
                {!notesOpen && (
                  <button type="button" onClick={() => setShowNotesField(true)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Notes
                  </button>
                )}
              </div>
            )}

            {locationOpen && (
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3" /> Location
                </label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Westside Clinic, kitchen, anywhere"
                  className="text-sm"
                />
              </div>
            )}

            {todoOpen && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Link to a to-do</label>
                <label className="flex items-center gap-2 mb-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createTodo}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setCreateTodo(next);
                      // Mutually exclusive with picking an existing to-do.
                      if (next) setSelectedTaskId(null);
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                  <span>Create a new to-do from this plan</span>
                </label>
                <select
                  value={selectedTaskId || ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setSelectedTaskId(v);
                    if (v) setCreateTodo(false);
                    if (v && !title.trim()) {
                      const t = tasks.find((x) => x.id === v);
                      if (t?.title) setTitle(t.title);
                    }
                  }}
                  disabled={createTodo}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm disabled:opacity-50"
                >
                  <option value="">— No to-do linked —</option>
                  {tasks.filter((t) => !t.completed).map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <p className="text-[0.6875rem] text-muted-foreground mt-1">
                  {createTodo
                    ? "A new to-do will be created with this plan's title and due date, then linked here."
                    : "Pick an existing to-do to schedule it for this time. Its due date will update to match."}
                </p>
              </div>
            )}

            {whoOpen && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Who's this for?
                  {selectedAlters.length > 0 && (
                    <span className="ml-1.5">({selectedAlters.length} selected)</span>
                  )}
                </label>
                <Button type="button" size="sm" variant="outline" onClick={() => setFronterPickerOpen(true)} className="w-full gap-2 text-xs">
                  <UserPlus className="w-3.5 h-3.5" />
                  {selectedAlters.length > 0 ? `Add or remove ${terms.alters}` : `Choose ${terms.alters}…`}
                </Button>
                {selectedAlters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedAlters.map((id) => {
                      const a = altersById[id];
                      if (!a) return null;
                      return <SelectedFronterChip key={id} alter={a} label={formatAlter(a)} onRemove={() => setSelectedAlters((prev) => prev.filter((x) => x !== id))} />;
                    })}
                  </div>
                )}
              </div>
            )}

            {notesOpen && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                <MentionTextarea
                  value={notes}
                  onChange={setNotes}
                  alters={alters || []}
                  placeholder="Extra context… @ to mention, /w @name [secret] to whisper"
                  className="h-20"
                />
              </div>
            )}
          </section>

          {/* ── OPTIONS — repeat / reminder / critical as flat rows in one
                 container (was: three separately-boxed cards). */}
          <section className="space-y-2.5">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Options</h3>
            <div className="rounded-xl border border-border/50 divide-y divide-border/40">
          {/* Recurrence — create-time only; editing one instance of a series
              doesn't change cadence. The branch chooser handles series scope
              before we get here. */}
          {!editingPlan && (
            <div className="p-3 space-y-2">
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
          <div className="p-3 space-y-2">
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
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Plan reminders are off. Turn them on to get a notification before this plan starts.
                </p>
                <Button size="sm" variant="outline" onClick={enablePlanRemindersInline} className="text-xs gap-1.5">
                  <Bell className="w-3.5 h-3.5" /> Turn on plan reminders
                </Button>
              </div>
            )}
          </div>

          {/* Critical + lead-steps */}
          <div className="p-3 space-y-2">
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
            </div>
          </section>

          <div className="flex gap-2 justify-end pt-1 border-t border-border/40">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Plan"}
            </Button>
          </div>

          <SetFrontModal
            open={fronterPickerOpen}
            onClose={() => setFronterPickerOpen(false)}
            alters={alters || []}
            selectionMode
            preselectedIds={selectedAlters}
            onConfirm={(ids) => setSelectedAlters(ids)}
            confirmLabel="Add to plan"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
