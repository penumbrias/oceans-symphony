import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PlannedActivitiesList from "@/components/activities/PlannedActivitiesList";
import { isSurfaceEnabled } from "@/lib/upcomingPlansSurfaces";

/**
 * Shared widget: a compact list of upcoming planned activities, surfaced
 * on whichever places the user has enabled in Settings → Appearance →
 * Upcoming plans visibility.
 *
 * Props:
 *   placement   — surface id (must match an entry in upcomingPlansSurfaces).
 *                 If the user hasn't enabled this placement, renders null.
 *   limit       — max items to show (default 5).
 *   filterByAlterId — optional; when set, only plans assigned to this alter
 *                     show. Used by the per-alter panel.
 *   title       — heading text. Default "📅 Coming up".
 */
export default function UpcomingPlans({ placement, limit = 5, filterByAlterId = null, title = "📅 Coming up" }) {
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

  // Per-alter panel ignores the surface gate (it's the contextual default
  // and the per-alter panel itself controls when it renders).
  if (placement !== "alter_panel" && !isSurfaceEnabled(settings, placement)) return null;

  // Filter for assigned alter if needed
  const visibleActivities = filterByAlterId
    ? activities.filter(a => (a.assigned_alter_ids || []).includes(filterByAlterId))
    : activities;

  // Compose the list — but only render the wrapper if there's at least one
  // upcoming item, so empty surfaces stay hidden.
  const now = Date.now();
  const upcomingCount = visibleActivities.filter(a => {
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
        activities={visibleActivities}
        alters={alters}
        compact
        limit={limit}
        onClick={(activity) => navigate(activity?.id ? `/activities?activityId=${activity.id}` : "/activities")}
      />
    </div>
  );
}
