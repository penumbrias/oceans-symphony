import React, { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { syncActivityResolved } from "@/lib/linkedCompletion";
import { appendRescheduleEntry } from "@/lib/activityStatus";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { ClipboardList, Play } from "lucide-react";
import {
  ACTIVITY_STATUSES,
  isPastTimeScheduled,
} from "@/lib/activityStatus";
import { addActiveActivity, getActiveActivities, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";
import { cancelPlanReminder, schedulePlanReminder } from "@/lib/planReminderScheduler";

// Dashboard surface that lists past-time scheduled plans the user hasn't
// resolved yet. One-tap buttons send the lifecycle update directly so
// nothing slides into the tally as "logged" by default.
//
// One-hour grace window — a plan that JUST passed isn't surfaced as a
// nag. Anything older than that and still in `status === "scheduled"` is
// fair game.
//
// Renders nothing when there are zero unresolved plans, so the dashboard
// stays clean when everything's caught up.

const DISPLAY_INLINE_LIMIT = 5;
const DISPLAY_COLLAPSE_LIMIT = 3;

// Settings toggle key. Default is ON — the nag is the whole point of the
// surface. When the user turns it off in Settings → Reminders, this key
// flips to "0" and the card renders nothing.
export const UNRESOLVED_NAG_KEY = "activity_unresolved_nag_v1";

export function isUnresolvedNagEnabled() {
  try {
    const v = localStorage.getItem(UNRESOLVED_NAG_KEY);
    if (v === null) return true; // default ON
    return v !== "0";
  } catch {
    return true;
  }
}

export default function UnresolvedPlansCard() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  // Categories only used to colour the active pill when a plan is started.
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  // Live active-activity sessions — a plan that's been started drops out of
  // the nag list (it's now handled, shown under Active Activities).
  const [activeActs, setActiveActs] = useState(() => getActiveActivities());
  useEffect(() => {
    const refresh = () => setActiveActs(getActiveActivities());
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(ACTIVE_ACTIVITY_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const activePlanIds = useMemo(
    () => new Set(activeActs.map((a) => a.planActivityId).filter(Boolean)),
    [activeActs]
  );

  // Refresh when the toggle changes elsewhere in the app. We re-read on
  // every render — cheap, and the Settings toggle dispatches a custom
  // event so this card hides immediately when toggled off.
  const [nagEnabled, setNagEnabled] = useState(isUnresolvedNagEnabled);
  useEffect(() => {
    const handler = () => setNagEnabled(isUnresolvedNagEnabled());
    window.addEventListener("activity-unresolved-nag-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("activity-unresolved-nag-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const unresolved = useMemo(
    () => activities
      .filter(isPastTimeScheduled)
      .filter((a) => !activePlanIds.has(a.id))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [activities, activePlanIds]
  );

  const [busyId, setBusyId] = useState(null);

  if (!nagEnabled) return null;
  if (unresolved.length === 0) return null;

  // Bullet-journal migration: push one plan (or all of them) forward instead
  // of forcing a verdict. Same time of day, next day forward of now; the move
  // is APPENDED to reschedule_history — never rewritten (data invariant).
  const rescheduleTo = async (act, toDate) => {
    setBusyId(act.id);
    try {
      const toIso = toDate.toISOString();
      await base44.entities.Activity.update(act.id, {
        timestamp: toIso,
        status: "scheduled",
        reschedule_history: appendRescheduleEntry(act.reschedule_history, act.timestamp, toIso),
      });
      try { await cancelPlanReminder(act.id); await schedulePlanReminder({ ...act, timestamp: toIso }); } catch { /* non-fatal */ }
      // Owner-approved: carrying a plan bumps its linked to-do's due date too.
      if (act.task_id) {
        try { await base44.entities.Task.update(act.task_id, { due_date: toIso }); } catch { /* best-effort */ }
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Moved to tomorrow");
    } catch (err) {
      toast.error(err?.message || "Couldn't reschedule");
    } finally {
      setBusyId(null);
    }
  };
  const tomorrowSameTime = (act) => {
    const d = new Date(act.timestamp);
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(d.getHours(), d.getMinutes(), 0, 0);
    return t;
  };
  const rescheduleTomorrow = (act) => rescheduleTo(act, tomorrowSameTime(act));
  const carryOverAll = async (acts) => {
    for (const act of acts) {
      // Sequential on purpose: each write appends history; racing them
      // against the same list invites lost updates.
      await rescheduleTo(act, tomorrowSameTime(act)); // eslint-disable-line no-await-in-loop
    }
  };

  const resolve = async (act, status, extra = {}) => {
    setBusyId(act.id);
    try {
      await base44.entities.Activity.update(act.id, {
        status,
        ...extra,
      });
      await syncActivityResolved(act, status);
      toast.success(`Marked ${status}`);
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (err) {
      toast.error(err?.message || "Couldn't update plan");
    } finally {
      setBusyId(null);
    }
  };

  // Start a plan as an in-progress active session (same mechanism as the
  // lifecycle popover's "Start now"). Linked back via planActivityId, so
  // ending it resolves THIS plan to done. The plan drops out of the nag.
  const colorForPlan = (act) => {
    for (const id of (act.activity_category_ids || [])) {
      const c = categories.find((c) => c.id === id);
      if (c?.color) return c.color;
    }
    return act.color || null;
  };
  const startActive = (act) => {
    addActiveActivity({
      planActivityId: act.id,
      categoryId: (act.activity_category_ids || [])[0] || null,
      name: act.activity_name || "Activity",
      color: colorForPlan(act),
      startTime: new Date().toISOString(),
      alterIds: act.fronting_alter_ids || [],
      notes: (act.notes || "").trim(),
    });
    cancelPlanReminder(act.id).catch(() => {});
    toast.success("Started — it's now in your Active Activities");
  };

  // Decide what to render: full inline list up to 5; otherwise 3 + a
  // "View all (N)" link to the Planned tab on the Activity Tracker.
  const showInline = unresolved.length <= DISPLAY_INLINE_LIMIT;
  const visible = showInline
    ? unresolved
    : unresolved.slice(0, DISPLAY_COLLAPSE_LIMIT);

  return (
    <Card className="mb-3 p-3 border-amber-500/40 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardList className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-foreground">
          Plans needing review
        </h3>
        <span className="text-xs text-muted-foreground">
          ({unresolved.length})
        </span>
        {unresolved.length > 1 && (
          <button type="button"
            onClick={() => carryOverAll(unresolved)}
            className="ml-auto text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground"
            title="Move every unresolved plan to tomorrow at its own time">
            Carry all to tomorrow
          </button>
        )}
      </div>

      <div className="space-y-2">
        {visible.map((act) => (
          <UnresolvedPlanRow
            key={act.id}
            act={act}
            busy={busyId === act.id}
            onResolve={resolve}
            onReschedule={rescheduleTomorrow}
            onStart={() => startActive(act)}
            onOpen={() => navigate(`/planner?activityId=${act.id}`)}
          />
        ))}
      </div>

      {!showInline && (
        <button
          type="button"
          onClick={() => navigate("/planner")}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          View all ({unresolved.length})
        </button>
      )}
    </Card>
  );
}

// Double-tap the row body → /planner?activityId=<id>, which opens the
// Activity Details modal automatically (same pattern as
// CriticalPlanCard). Single tap is a no-op so the lifecycle buttons
// stay the primary one-shot affordance — accidentally tapping the row
// shouldn't yank the user off the dashboard.
function UnresolvedPlanRow({ act, busy, onResolve, onReschedule, onStart, onOpen }) {
  const lastTapRef = useRef(0);
  const handleRowTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0;
      onOpen();
      return;
    }
    lastTapRef.current = now;
  };
  return (
    <div
      onClick={handleRowTap}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      role="button"
      tabIndex={0}
      title="Double-tap to open this plan"
      className="rounded-md border border-border/60 bg-card p-2 space-y-1.5 cursor-pointer select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {act.activity_name || "Untitled plan"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {format(new Date(act.timestamp), "EEE d MMM, HH:mm")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onStart(); }}
          className="h-7 text-xs px-2 gap-1 border-primary/50 text-primary hover:bg-primary/10"
        >
          <Play className="w-3 h-3" /> Start
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onResolve(act, ACTIVITY_STATUSES.DONE); }}
          className="h-7 text-xs px-2"
        >
          Done
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onResolve(act, ACTIVITY_STATUSES.PARTIAL); }}
          className="h-7 text-xs px-2"
        >
          Partial
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onReschedule(act); }}
          className="h-7 text-xs px-2"
        >
          Tomorrow
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onResolve(act, ACTIVITY_STATUSES.SKIPPED); }}
          className="h-7 text-xs px-2"
        >
          Skipped
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onResolve(act, ACTIVITY_STATUSES.CANCELLED); }}
          className="h-7 text-xs px-2"
        >
          Cancelled
        </Button>
      </div>
    </div>
  );
}
