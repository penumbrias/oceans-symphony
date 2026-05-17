import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PlannedActivitiesList from "@/components/activities/PlannedActivitiesList";
import { isSurfaceEnabled } from "@/lib/upcomingPlansSurfaces";
import {
  getActiveLimit,
  MODE_WINDOW,
  WINDOW_MODE_HARD_CAP,
} from "@/lib/upcomingPlansLimit";

/**
 * Shared widget: a compact list of upcoming planned activities, surfaced
 * on whichever places the user has enabled in Settings → Appearance →
 * Upcoming plans visibility.
 *
 * Props:
 *   placement   — surface id (must match an entry in upcomingPlansSurfaces).
 *                 If the user hasn't enabled this placement, renders null.
 *   limit       — max items to show. Pass an explicit number to force a
 *                 cap (e.g. the alter panel uses 3 to stay compact); leave
 *                 undefined to honour the user's Settings → Upcoming Plans
 *                 Visibility "limit" preference (count or time window).
 *   filterByAlterId — optional; when set, only plans assigned to this alter
 *                     show. Used by the per-alter panel.
 *   title       — heading text. Default "📅 Coming up".
 */
export default function UpcomingPlans({ placement, limit, filterByAlterId = null, title = "📅 Coming up" }) {
  const navigate = useNavigate();

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList[0] || null;

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  // Track the user's limit preference; re-read when the storage key changes
  // (e.g. when the setting is edited in Settings). The window-event
  // listener fires on cross-tab updates; we also re-read on mount.
  const [limitConfig, setLimitConfig] = useState(() => getActiveLimit());
  useEffect(() => {
    const reread = () => setLimitConfig(getActiveLimit());
    window.addEventListener("storage", reread);
    window.addEventListener("upcoming-plans-limit-changed", reread);
    return () => {
      window.removeEventListener("storage", reread);
      window.removeEventListener("upcoming-plans-limit-changed", reread);
    };
  }, []);

  // Per-alter panel ignores the surface gate (it's the contextual default
  // and the per-alter panel itself controls when it renders).
  if (placement !== "alter_panel" && !isSurfaceEnabled(settings, placement)) return null;

  // Filter for assigned alter if needed
  const visibleActivities = filterByAlterId
    ? activities.filter(a => (a.assigned_alter_ids || []).includes(filterByAlterId))
    : activities;

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
      const ts = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
      return ts > 0 && ts <= cutoff;
    });
    effectiveLimit = WINDOW_MODE_HARD_CAP;
  } else {
    effectiveLimit = limitConfig.count;
  }

  // Compose the list — but only render the wrapper if there's at least one
  // upcoming item, so empty surfaces stay hidden.
  const now = Date.now();
  const upcomingCount = prefilteredActivities.filter(a => {
    const ts = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    return ts > now;
  }).length;
  if (upcomingCount === 0) return null;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Calendar className="w-3 h-3" /> {title}
        </p>
        <button
          type="button"
          onClick={() => navigate("/activities")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >See all</button>
      </div>
      <PlannedActivitiesList
        activities={prefilteredActivities}
        alters={alters}
        compact
        limit={effectiveLimit}
        onClick={(activity) => navigate(activity?.id ? `/activities?activityId=${activity.id}` : "/activities")}
      />
    </div>
  );
}
