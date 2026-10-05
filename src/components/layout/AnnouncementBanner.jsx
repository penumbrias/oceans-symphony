import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Calendar, X } from "lucide-react";
import { formatDistance } from "date-fns";
import { base44 } from "@/api/base44Client";
import { isSurfaceEnabled, SURFACE_IN_APP_BANNER } from "@/lib/upcomingPlansSurfaces";
import { duePlanReminder, ackPlan } from "@/lib/planBannerAcks";
import { useNowTick } from "@/lib/useNowTick";

export default function AnnouncementBanner() {
  const navigate = useNavigate();
  // Re-check every minute so the banner appears the moment the reminder
  // window opens, and on resume so a frozen background clock can't call a
  // past plan upcoming.
  const now = useNowTick(60_000);
  const [, setDismissed] = React.useState(0);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList[0] || null;

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  if (!isSurfaceEnabled(settings, SURFACE_IN_APP_BANNER)) return null;

  // Selector + ack store shared with the v2 home notices (lib/planBannerAcks)
  // so dismissing the reminder in either UI settles it in both.
  const dueSoon = duePlanReminder(activities, now);

  if (!dueSoon) return null;

  const dismiss = () => { ackPlan(dueSoon.id); setDismissed((x) => x + 1); };

  return (
    <div
      className="bg-primary/10 border-b border-primary/30 px-4 py-2 flex items-center gap-2 text-sm"
      style={{
        paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
        paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
      }}
    >
      <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
      <button
        type="button"
        onClick={() => navigate("/activities")}
        className="flex-1 text-left text-foreground hover:underline"
      >
        {new Date(dueSoon.timestamp).getTime() > now
          ? <>You have <strong>{dueSoon.activity_name || "an activity"}</strong> planned in {formatDistance(new Date(dueSoon.timestamp), now)}.</>
          : <><strong>{dueSoon.activity_name || "An activity"}</strong> was planned {formatDistance(new Date(dueSoon.timestamp), now)} ago.</>}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground p-1 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
