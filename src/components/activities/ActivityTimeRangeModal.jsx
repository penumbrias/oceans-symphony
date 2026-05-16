import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format, addHours, differenceInMinutes, addDays, addWeeks, addMonths } from "date-fns";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { Plus, MapPin, Zap, Repeat } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { LEAD_STEPS, DEFAULT_LEAD_STEPS } from "@/lib/criticalPins";
import { useTerms } from "@/lib/useTerms";

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

export default function ActivityTimeRangeModal({
  isOpen,
  onClose,
  startDate: startDateProp,
  endDate: endDateProp,
  startHour,
  endHour, startMinute = 0,
  endMinute = 0,
  alters,
  frontingHistory,
  onSave,
  // When true, show date inputs and default to a near-future timestamp so the
  // user can plan an activity for any day rather than only tapping a slot.
  planMode = false,
  // When provided, the modal opens pre-populated from this existing
  // Activity (must already be is_planned) and saves with Activity.update
  // instead of creating new records. Recurrence editing is intentionally
  // out of scope — editing the start/end/category/etc. of a single plan
  // is what users have been asking for.
  editingPlan = null,
}) {
  const terms = useTerms();
  // For plan mode without an explicit start date, default to tomorrow noon so
  // the modal starts from a sensible plannable point.
  const defaultedStart = startDateProp || (planMode ? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d; })() : null);
  // Local state for the chosen date (yyyy-mm-dd) so plan mode can edit it.
  const [datePicked, setDatePicked] = useState(() => defaultedStart ? format(defaultedStart, "yyyy-MM-dd") : "");
  const [endDatePicked, setEndDatePicked] = useState(() => (endDateProp || defaultedStart) ? format(endDateProp || defaultedStart, "yyyy-MM-dd") : "");
  const startDate = datePicked ? new Date(`${datePicked}T00:00:00`) : defaultedStart;
  const endDate = endDatePicked ? new Date(`${endDatePicked}T00:00:00`) : startDate;
  const isCrossDay = startDate && endDate && format(startDate, "yyyy-MM-dd") !== format(endDate, "yyyy-MM-dd");

  const defaultStart = startDate && startHour !== undefined
    ? toTimeString(startDate, Math.min(startHour, isCrossDay ? startHour : (endHour ?? startHour)))
    : (planMode && startDate ? toTimeString(startDate, 12, 0) : "");
  const defaultEnd = endDate && endHour != null
    ? toTimeString(endDate, endHour, endMinute)
    : (planMode && endDate ? toTimeString(endDate, 13, 0) : "");

  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // One-off plan details — only used in plan mode. Title (when set) becomes
  // the activity_name on save so users don't need to create a permanent
  // category for "Doctor's appointment" or similar one-time events.
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [isCritical, setIsCritical] = useState(false);
  const [leadSteps, setLeadSteps] = useState(DEFAULT_LEAD_STEPS);
  // Recurrence (plan mode only). "none" means single occurrence. When set
  // to anything else, handleSave generates `recurrenceCount` Activity records
  // spaced by the chosen interval, all sharing a `recurrence_group_id`.
  const [recurrenceInterval, setRecurrenceInterval] = useState("none");
  const [recurrenceCount, setRecurrenceCount] = useState(8);
  const queryClient = useQueryClient();
const [newActivityName, setNewActivityName] = useState("");
const [showNewActivity, setShowNewActivity] = useState(false);
  // Optional link to an existing to-do task (plan mode only). Picking a task
  // is one of the three independent ways to fill a plan — title, activity
  // category, or task — only one is required.
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  // Fetch categories so we can resolve names for direct entity saves
  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  // Fetch tasks for the to-do picker (plan mode only). Filter out completed
  // ones at render time so the dropdown stays useful.
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
    enabled: planMode,
  });

  // Reset times/date when modal opens with new props. MUST be useEffect (not
  // useMemo): we're calling setState here, which inside a useMemo body would
  // mutate state during render. With useMemo the deps were also tricky —
  // startDateProp / endDateProp can be Date instances that recreate every
  // parent render, which compounded the problem. useEffect schedules the
  // updates after commit and React batches them.
useEffect(() => {
  if (!isOpen) return;
  // Edit-an-existing-plan branch: hydrate every field from the record.
  // Falls through to the same selectedAlters auto-populate effect below.
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
    // The activity_name doubles as the plan title for ad-hoc plans (no
    // category linked) and as the category name when categories are set.
    // Only pre-fill the title field for the ad-hoc case so the user
    // doesn't see the category name duplicated in the title input.
    setTitle((editingPlan.activity_category_ids || []).length === 0 ? (editingPlan.activity_name || "") : "");
    setLocation(editingPlan.location || "");
    setIsCritical(!!editingPlan.is_critical);
    setLeadSteps(editingPlan.critical_lead_steps || DEFAULT_LEAD_STEPS);
    setSelectedTaskId(editingPlan.task_id || null);
    setRecurrenceInterval("none");
    setRecurrenceCount(8);
    return;
  }
  // Reset the picked date back to whatever the parent passed in (or to the
  // plan-mode default tomorrow). Without this the date picker would persist
  // across opens, which is confusing.
  if (startDateProp) {
    setDatePicked(format(startDateProp, "yyyy-MM-dd"));
    setEndDatePicked(format(endDateProp || startDateProp, "yyyy-MM-dd"));
  } else if (planMode) {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
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
  } else if (planMode) {
    setStartTime("12:00");
    setEndTime("13:00");
  }
  setSelectedActivityCategories([]);
  setNotes("");
  setTitle("");
  setLocation("");
  setIsCritical(false);
  setLeadSteps(DEFAULT_LEAD_STEPS);
  setSelectedTaskId(null);
  setRecurrenceInterval("none");
  setRecurrenceCount(8);
}, [isOpen, editingPlan, startDateProp, endDateProp, startHour, endHour, startMinute, endMinute, planMode]);

  // Auto-populate alters from fronting history. MUST be useEffect, not
  // useMemo — `startDate` here is a fresh `new Date(...)` instance on every
  // render, so a useMemo dep on it changed every render and re-fired
  // setSelectedAlters every render, causing an infinite update loop that
  // surfaced as a crash when picking a time range. Switching to useEffect +
  // a stable date key (yyyy-MM-dd) avoids both bugs.
  const startDateKey = startDate ? format(startDate, "yyyy-MM-dd") : null;
  useEffect(() => {
    if (startDate && startHour !== undefined && endHour !== undefined) {
      const startDt = new Date(startDate);
      startDt.setHours(Math.min(startHour, endHour), startMinute, 0, 0);
      const endDt = new Date(startDate);
      endDt.setHours(Math.max(startHour, endHour) + 1, endMinute, 0, 0);
      const relevantSessions = frontingHistory.filter((s) => {
        const ss = new Date(s.start_time);
        const se = s.end_time ? new Date(s.end_time) : new Date();
        return ss < endDt && se > startDt;
      });
      const alterIds = new Set();
      relevantSessions.forEach((s) => {
        if (s.primary_alter_id) alterIds.add(s.primary_alter_id);
        (s.co_fronter_ids || []).forEach((id) => alterIds.add(id));
      });
      setSelectedAlters(Array.from(alterIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateKey, startHour, endHour, startMinute, endMinute, frontingHistory]);

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

  // Update handleSave to allow no duration:
const handleSave = async () => {
  const trimmedTitle = title.trim();
  const linkedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;
  // Plan mode: any ONE of (title, activity category, linked to-do) is enough.
  // Non-plan logging still requires a category — back-dated entries should
  // tag a real activity so analytics stay meaningful.
  if (planMode) {
    if (
      selectedActivityCategories.length === 0 &&
      !trimmedTitle &&
      !linkedTask
    ) {
      toast.error("Add a title, pick an activity, or link a to-do");
      return;
    }
  } else if (selectedActivityCategories.length === 0) {
    toast.error("Select an activity");
    return;
  }
  if (!startTime) { toast.error("Set start time"); return; }
  // Only validate end time if one was provided
  if (endTime && durationMinutes <= 0) { toast.error("End time must be after start time"); return; }

  setIsLoading(true);
  const timestamp = parseTimeToDate(startDate, startTime);
  const endDt = endTime ? parseTimeToDate(endDate || startDate, endTime) : null;

  try {
    const catById = Object.fromEntries(activityCategories.map(c => [c.id, c]));
    const isPlanned = timestamp.getTime() > Date.now();

    // Edit-an-existing-plan path: update that single record and bail
    // before the create-many recurrence flow runs. Recurrence is a
    // create-time concept here; editing a plan touches just this one
    // instance.
    if (editingPlan) {
      const firstCatId = selectedActivityCategories[0];
      const firstCat = firstCatId ? catById[firstCatId] : null;
      const fallbackName = trimmedTitle || linkedTask?.title || firstCat?.name || editingPlan.activity_name || "";
      await base44.entities.Activity.update(editingPlan.id, {
        timestamp: timestamp.toISOString(),
        activity_name: fallbackName,
        activity_category_ids: selectedActivityCategories,
        ...(firstCat?.color ? { color: firstCat.color } : {}),
        task_id: linkedTask?.id || null,
        duration_minutes: durationMinutes > 0 ? durationMinutes : null,
        fronting_alter_ids: selectedAlters,
        notes: notes || null,
        location: location.trim() || null,
        is_planned: isPlanned,
        is_critical: !!isCritical,
        critical_lead_steps: isCritical ? leadSteps : null,
        assigned_alter_ids: isPlanned ? selectedAlters : [],
      });
      // Keep the linked to-do's due_date in sync.
      if (linkedTask) {
        try {
          const dueDateStr = format(timestamp, "yyyy-MM-dd");
          if (linkedTask.due_date !== dueDateStr) {
            await base44.entities.Task.update(linkedTask.id, { due_date: dueDateStr });
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
          }
        } catch { /* non-fatal — plan still saves */ }
      }
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Plan updated");
      onSave?.();
      onClose?.();
      setIsLoading(false);
      return;
    }

    // Build the list of records to create. With categories: one per category
    // (existing behaviour). Without categories but with a title or linked
    // to-do: a single ad-hoc record. When a to-do is linked and no title
    // was typed, fall back to the task title so the plan reads naturally.
    const fallbackName = trimmedTitle || linkedTask?.title || "";
    const records = selectedActivityCategories.length > 0
      ? selectedActivityCategories.map(catId => {
          const cat = catById[catId];
          return {
            activity_name: fallbackName || (cat?.name || catId),
            activity_category_ids: [catId],
            color: cat?.color,
          };
        })
      : [{ activity_name: fallbackName, activity_category_ids: [], color: undefined }];

    // Compute the timestamps for this save. Single-occurrence is just
    // [timestamp]. For a recurring plan we generate up to recurrenceCount
    // future timestamps spaced by the chosen interval. All instances share
    // a `recurrence_group_id` so future edits can identify the series.
    const recurrenceGroupId =
      planMode && recurrenceInterval !== "none"
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
          duration_minutes: durationMinutes > 0 ? durationMinutes : null, // null = logged pill
          fronting_alter_ids: selectedAlters,
          notes: notes || null,
          location: planMode && location.trim() ? location.trim() : null,
          is_planned: occurrenceIsPlanned,
          is_critical: planMode && isCritical ? true : false,
          critical_lead_steps: planMode && isCritical ? leadSteps : null,
          // Recurrence metadata — null on single-occurrence plans. Stored on
          // every instance so future "edit series / delete series" can find
          // the group from any one record.
          recurrence_group_id: recurrenceGroupId,
          recurrence_interval: recurrenceGroupId ? recurrenceInterval : null,
          // For planned activities, treat selectedAlters as the assignees too
          // so the per-alter "Plans for me" surface picks them up.
          assigned_alter_ids: occurrenceIsPlanned ? selectedAlters : [],
        });
      }
    }

    // When a to-do was linked to this plan, sync the task's due_date so
    // the to-do list also reflects when it's scheduled. We only push the
    // date (yyyy-MM-dd) since Task.due_date is a date field.
    if (linkedTask) {
      try {
        const dueDateStr = format(timestamp, "yyyy-MM-dd");
        if (linkedTask.due_date !== dueDateStr) {
          await base44.entities.Task.update(linkedTask.id, { due_date: dueDateStr });
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }
      } catch { /* non-fatal — plan still saves */ }
    }
    // ... rest of fronting session logic unchanged

      // Handle fronting session update if alters selected — but skip
      // entirely for planned (future) activities, since the alter isn't
      // actually fronting yet.
      //
      // Both branches below use the per-alter FrontingSession model
      // (`alter_id` + `is_primary`) rather than the legacy
      // `primary_alter_id` + `co_fronter_ids` shape. The legacy shape
      // implicitly elected `selectedAlters[0]` as primary, which silently
      // promoted whichever alter happened to land first in the Set/array
      // — a regression of the same class as the 0.16.9 "set as primary
      // grabbed a random other one" bug.
      //
      // Identity decision here: we deliberately do NOT promote anyone to
      // primary based on selection order. Activities logged in this modal
      // are about which alters were present, not which one was steering.
      // If there's no existing primary among the active sessions, the
      // front simply has no primary until the user explicitly sets one.
      if (selectedAlters.length > 0 && timestamp.getTime() <= Date.now()) {
        const now = new Date();
        const diffMins = (now - timestamp) / 60000;
        const isCurrentTime = diffMins < 10;
        const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });

        if (isCurrentTime && activeSessions.length > 0) {
          // Adding alters to the current front. Build a set of which
          // alters already have an active session (under either model)
          // so we only create rows for the truly-new co-fronters.
          const alreadyActive = new Set();
          for (const s of activeSessions) {
            if (s.alter_id) alreadyActive.add(s.alter_id);
            if (s.primary_alter_id) alreadyActive.add(s.primary_alter_id);
            for (const id of (s.co_fronter_ids || [])) alreadyActive.add(id);
          }
          for (const alterId of selectedAlters) {
            if (alreadyActive.has(alterId)) continue;
            // Newly added — join as a co-fronter. Never promote based on
            // array order; primary status is preserved on whoever already
            // holds it.
            await base44.entities.FrontingSession.create({
              alter_id: alterId,
              is_primary: false,
              start_time: timestamp.toISOString(),
              is_active: true,
            });
          }
        } else {
          // No current front (or back-dated activity). Create one session
          // per selected alter. We don't try to guess a primary from
          // selection order — leave them all as co-fronters and let the
          // user promote one explicitly if they want to.
          const isStillActive = endDt ? endDt >= now : true;
          for (const alterId of selectedAlters) {
            await base44.entities.FrontingSession.create({
              alter_id: alterId,
              is_primary: false,
              start_time: timestamp.toISOString(),
              end_time: isStillActive ? null : endDt?.toISOString(),
              is_active: isStillActive,
            });
          }
        }
      }

      setSelectedActivityCategories([]);
      setNotes("");
      setTitle("");
      setLocation("");
      setIsCritical(false);
      setLeadSteps(DEFAULT_LEAD_STEPS);
      onSave?.();
      onClose();
      toast.success(
        planMode
          ? (recurrenceGroupId
              ? `Plan saved — ${occurrences.length} occurrences scheduled.`
              : "Plan saved!")
          : "Activity saved!"
      );
    } catch (err) {
      toast.error(err.message || "Failed to log activity");
    } finally {
      setIsLoading(false);
    }
  };

const handleCreateNewActivity = async () => {
    if (!newActivityName.trim()) return;
    const newCat = await base44.entities.ActivityCategory.create({
      name: newActivityName.trim(),
      color: "#8b5cf6",
      parent_category_id: null,
    });
    queryClient.invalidateQueries({ queryKey: ["activityCategories"] });
    setSelectedActivityCategories(prev => [...prev, newCat.id]);
    setNewActivityName("");
    setShowNewActivity(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingPlan ? "Edit Plan" : (planMode ? "Plan Activity" : "Log Activity")}
            {startDate && !planMode && (
              <div className="text-sm font-normal text-muted-foreground mt-1">
                {format(startDate, "MMM d, yyyy")}
                {isCrossDay && endDate && (
                  <span className="ml-1 text-primary">→ {format(endDate, "MMM d")}</span>
                )}
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {planMode && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium block mb-1">Date</label>
                <input type="date" value={datePicked} onChange={e => { setDatePicked(e.target.value); if (!endDatePicked || endDatePicked < e.target.value) setEndDatePicked(e.target.value); }}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium block mb-1">End date <span className="text-xs text-muted-foreground">(optional)</span></label>
                <input type="date" value={endDatePicked} min={datePicked} onChange={e => setEndDatePicked(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
              </div>
            </div>
          )}
          {/* Start / End time */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium block mb-1">Time</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
              </div>
              {(endHour != null || planMode) && (
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1">
                    End time
                    {isCrossDay && endDate && (
                      <span className="ml-1 text-xs text-primary font-normal">{format(endDate, "MMM d")}</span>
                    )}
                  </label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
                </div>
              )}
              {durationMinutes > 0 && (
                <div className="text-xs text-muted-foreground pb-2 whitespace-nowrap">
                  {durationMinutes >= 60
                    ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60 > 0 ? durationMinutes % 60 + "m" : ""}`
                    : `${durationMinutes}m`}
                </div>
              )}
          </div>

          {/* Title (plan mode only) — saves into activity_name. Lets users
              record a one-off plan without polluting their category list. */}
          {planMode && (
            <div>
              <label className="text-sm font-medium block mb-1">Title</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Doctor's appointment, school pickup, etc."
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional — you only need <strong>one</strong> of: a title, an activity category (below), or a linked to-do. Combine them however you like.
              </p>
            </div>
          )}

          {/* Link an existing to-do (plan mode only). Picks from the To-Do
              list; the plan stores task_id and the task's due_date syncs
              to the plan's start date on save. */}
          {planMode && (
            <div>
              <label className="text-sm font-medium block mb-1">Link to a to-do <span className="text-xs text-muted-foreground">(optional)</span></label>
              <select
                value={selectedTaskId || ""}
                onChange={e => {
                  const v = e.target.value || null;
                  setSelectedTaskId(v);
                  // If the user picks a task and hasn't typed a title yet,
                  // mirror the task title into the field as a hint they can
                  // overwrite. We intentionally don't autofill if title was
                  // already typed so we don't clobber user input.
                  if (v && !title.trim()) {
                    const t = tasks.find(x => x.id === v);
                    if (t?.title) setTitle(t.title);
                  }
                }}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">— No to-do linked —</option>
                {tasks.filter(t => !t.completed).map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Pick an existing to-do to schedule it for this time. Its due date will update to match.
              </p>
            </div>
          )}

          {/* Location (plan mode only) */}
          {planMode && (
            <div>
              <label className="text-sm font-medium flex items-center gap-1 mb-1"><MapPin className="w-3.5 h-3.5" /> Location <span className="text-xs text-muted-foreground">(optional)</span></label>
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Westside Clinic, kitchen, anywhere"
                className="text-sm"
              />
            </div>
          )}

          {/* Recurrence picker (plan mode only). When set to anything other
              than "none", the save loop generates `recurrenceCount` Activity
              records spaced by the interval, all tagged with a shared
              recurrence_group_id. Hidden when editing an existing plan —
              recurrence is a create-time concept and editing one
              instance of a series is what the user is doing here. */}
          {planMode && !editingPlan && (
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
                ].map(opt => {
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

          {/* Critical toggle + lead-step picker (plan mode only) */}
          {planMode && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
              <button
                type="button"
                onClick={() => setIsCritical(v => !v)}
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
                    {LEAD_STEPS.map(step => {
                      const active = leadSteps.includes(step.key);
                      return (
                        <button
                          key={step.key}
                          type="button"
                          onClick={() => setLeadSteps(prev => active ? prev.filter(k => k !== step.key) : [...prev, step.key])}
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
          )}

          {/* Activities */}
          <ActivityPillSelector
            selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
          />

          {showNewActivity ? (
            <div className="space-y-2">
              <Input placeholder="Activity name..." value={newActivityName}
                onChange={e => setNewActivityName(e.target.value)} className="text-sm" autoFocus />
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => { setShowNewActivity(false); setNewActivityName(""); }}
                  className="flex-1">Cancel</Button>
                <Button size="sm" onClick={handleCreateNewActivity}
                  disabled={!newActivityName.trim()} className="flex-1">Add</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewActivity(true)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center justify-center gap-1">
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
                    id={`alter-${alter.id}`}
                  />
                  <label htmlFor={`alter-${alter.id}`} className="text-sm cursor-pointer flex-1">
                    {alter.alias || alter.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Notes / Description */}
          <div>
            <label className="text-sm font-medium text-foreground">
              {planMode ? "Description / notes — Optional" : "Notes — Optional"}
            </label>
            <MentionTextarea
              value={notes}
              onChange={setNotes}
              alters={alters || []}
              placeholder={planMode ? "Extra context: what, why, who's coming, anything to remember…" : "Any additional notes..."}
              className="mt-1 h-20"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? "Saving..." : (planMode ? "Save Plan" : "Save Activity")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  
}