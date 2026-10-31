import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PlannedActivitiesList from "@/components/activities/PlannedActivitiesList";
import RecurringTasksDue, { useRecurringTasksDue } from "@/components/tasks/RecurringTasksDue";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { activityDate } from "@/lib/dateUtils";
import {
  getActiveLimit,
  MODE_COUNT,
  MODE_WINDOW,
  WINDOW_MODE_HARD_CAP,
  WINDOW_OPTIONS,
  COUNT_MIN,
  COUNT_MAX,
} from "@/lib/upcomingPlansLimit";

/**
 * Shared widget: a compact list of upcoming planned activities. Placing
 * it (on a board, in the per-alter panel) IS the opt-in — the old
 * Settings → Appearance surfaces list is gone (v0.319.0).
 *
 * Props:
 *   placement   — which copy this is; the scope of its older saved
 *                 count / window (upcomingPlansLimit.js).
 *   limit       — max items to show. Pass an explicit number to force a
 *                 cap (e.g. the alter panel uses 3 to stay compact).
 *   limitConfig — { mode: "count", count } or { mode: "window", windowMs |
 *                 windowId } from the hosting widget's own options
 *                 (comingUpOptions.jsx).
 *   filterByAlterId — optional; when set, only plans assigned to this alter
 *                     show. Used by the per-alter panel.
 *   showRecurring — also list today's recurring tasks (every kind, with
 *                   entry) under the plans. Off for the per-alter panel.
 *   showPlans   — list the plans at all (off = only recurring tasks).
 *   showOverdue — keep scheduled plans whose time has passed but that
 *                 haven't been marked yet.
 *   recurringKinds / recurringShowDone — which recurring tasks (see
 *                 RecurringTasksDue), and whether finished ones stay.
 *   title       — heading text. Default "📅 Coming up".
 */
export default function UpcomingPlans({
  placement, limit, limitConfig: limitOverride = null, filterByAlterId = null,
  showRecurring = true, showPlans = true, showOverdue = true,
  recurringKinds = "all", recurringShowDone = true, title = "📅 Coming up",
}) {
  const navigate = useNavigate();

  const recurringOn = showRecurring && !filterByAlterId && typeof limit !== "number";
  const { rows: recurringRows } = useRecurringTasksDue({ enabled: recurringOn, kinds: recurringKinds, showDone: recurringShowDone });

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  // The count / window now lives in each widget's options (v0.327.0,
  // comingUpOptions.jsx); the panel's old cog is gone. A caller without
  // options still gets this placement's saved preference.
  const storedLimit = useMemo(() => getActiveLimit(placement), [placement]);
  // The hosting widget's own options win over the stored preference.
  // A window may come as a number of milliseconds (the widget's "how far
  // ahead" slider) or as one of the older fixed window ids.
  const limitConfig = limitOverride
    ? (limitOverride.mode === MODE_WINDOW
      ? (Number(limitOverride.windowMs) > 0
        ? { mode: MODE_WINDOW, windowMs: Number(limitOverride.windowMs), windowLabel: limitOverride.windowLabel || "" }
        : (() => { const opt = WINDOW_OPTIONS.find((w) => w.id === limitOverride.windowId) || WINDOW_OPTIONS[3]; return { mode: MODE_WINDOW, windowMs: opt.ms, windowId: opt.id, windowLabel: opt.label }; })())
      : { mode: MODE_COUNT, count: Math.min(COUNT_MAX, Math.max(COUNT_MIN, Number(limitOverride.count) || 5)) })
    : storedLimit;

  // Filter for assigned alter if needed
  // Overdue = still scheduled but its time has passed (an untimed day plan
  // only once its day is over). Hidden when the widget says so.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const isOverdue = (a) => {
    if (a?.timestamp) return new Date(a.timestamp).getTime() <= Date.now();
    const d = activityDate(a);
    return !!d && d.getTime() < todayStart.getTime();
  };
  const visibleActivities = !showPlans ? [] : activities.filter((a) => {
    if (filterByAlterId && !(a.assigned_alter_ids || []).includes(filterByAlterId)) return false;
    if (!showOverdue && statusFor(a) === ACTIVITY_STATUSES.SCHEDULED && isOverdue(a)) return false;
    return true;
  });

  // Decide the limit + any pre-filter to apply.
  //
  // If the caller passed an explicit `limit` prop (e.g. the alter panel
  // forces 3), respect it — those surfaces have a tighter context that
  // shouldn't pick up the user's dashboard preference. Otherwise consult
  // the user setting: count mode is a plain slice cap, window mode
  // pre-filters by timestamp and applies a sanity cap.
  let effectiveLimit;
  let prefilteredActivities = visibleActivities;
  if (typeof limit === "number") {
    effectiveLimit = limit;
  } else if (limitConfig.mode === MODE_WINDOW) {
    const cutoff = Date.now() + limitConfig.windowMs;
    prefilteredActivities = visibleActivities.filter(a => {
      if (statusFor(a) !== ACTIVITY_STATUSES.SCHEDULED) return false;
      // Timed plans by their time; untimed day plans by their day.
      const ts = a?.timestamp ? new Date(a.timestamp).getTime() : (activityDate(a)?.getTime() || 0);
      return ts > 0 && ts <= cutoff;
    });
    effectiveLimit = WINDOW_MODE_HARD_CAP;
  } else {
    effectiveLimit = limitConfig.count;
  }

  // Compose the list — but only render the wrapper if there's at least one
  // upcoming item, so empty surfaces stay hidden.
  const now = Date.now();
  // Only count still-SCHEDULED future plans, matching what
  // PlannedActivitiesList actually renders — otherwise a future plan
  // already marked done/skipped/cancelled would show the header with an
  // empty list under it (and eat window-mode slots).
  // An overdue plan counts too when it's shown (the widget's option), so
  // a list of only overdue plans isn't hidden.
  const upcomingCount = prefilteredActivities.filter(a => {
    if (statusFor(a) !== ACTIVITY_STATUSES.SCHEDULED) return false;
    if (limitOverride && showOverdue && isOverdue(a)) return true;
    const ts = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    return ts > now;
  }).length;
  const hasRecurring = recurringOn && recurringRows.length > 0;
  if (upcomingCount === 0 && !hasRecurring) return null;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Calendar className="w-3 h-3" /> {title}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/planner")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >See all</button>
        </div>
      </div>
      {upcomingCount > 0 && (
        <PlannedActivitiesList
          activities={prefilteredActivities}
          alters={alters}
          compact
          limit={effectiveLimit}
          onClick={(activity) => navigate(activity?.id ? `/planner?activityId=${activity.id}` : "/planner")}
        />
      )}
      {hasRecurring && <div className="px-1"><RecurringTasksDue kinds={recurringKinds} showDone={recurringShowDone} /></div>}
    </div>
  );
}
