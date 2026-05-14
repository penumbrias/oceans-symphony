import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { format, formatDistanceToNow } from "date-fns";
import { MapPin, X, Zap } from "lucide-react";
import { shouldShowPin, writeDismissal } from "@/lib/criticalPins";

// Top-of-Dashboard pinned cards for plans the user marked critical /
// urgent. A card appears whenever any of the plan's selected lead-step
// windows opens (e.g. "1h before"), and re-appears at the next narrower
// window if the user dismissed an earlier one. Disappears for good once
// the plan's start + duration has passed.

export default function CriticalPinnedPlans() {
  const navigate = useNavigate();
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  // Force a re-render every minute so the visibility window check stays
  // accurate even if the user leaves the dashboard open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Also re-render when the dismissal map changes from elsewhere.
  const [dismissNonce, setDismissNonce] = useState(0);

  const visible = useMemo(() => {
    const now = Date.now();
    return activities
      .filter(a => a.is_critical && a.is_planned)
      .filter(a => {
        const start = new Date(a.timestamp).getTime();
        const end = start + ((a.duration_minutes || 0) * 60_000);
        // Plan is still upcoming or in-progress (allow a 10-minute grace
        // after end so a critical event doesn't snap away the moment it ends).
        return end + 10 * 60_000 > now;
      })
      .map(a => ({ plan: a, openStep: shouldShowPin(a, now) }))
      .filter(x => x.openStep)
      .sort((a, b) => new Date(a.plan.timestamp) - new Date(b.plan.timestamp));
  }, [activities, dismissNonce]);

  if (visible.length === 0) return null;

  const dismiss = (plan, openStep) => {
    writeDismissal(plan.id, openStep.key);
    setDismissNonce(n => n + 1);
  };

  return (
    <div className="space-y-2 mb-3">
      {visible.map(({ plan, openStep }) => (
        <CriticalPlanCard
          key={plan.id}
          plan={plan}
          openStep={openStep}
          onDismiss={() => dismiss(plan, openStep)}
          onOpen={() => navigate(`/activities?activityId=${plan.id}`)}
        />
      ))}
    </div>
  );
}

// Double-tap the card body → /activities?activityId=<id>, which opens the
// Activity Details modal automatically. Single tap is a no-op (the X
// dismiss button handles its own click; navigating away on a single tap
// would be too easy to trigger by accident).
function CriticalPlanCard({ plan, openStep, onDismiss, onOpen }) {
  const ts = new Date(plan.timestamp);
  const inFuture = ts.getTime() > Date.now();
  const lastTapRef = useRef(0);
  const handleClick = () => {
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
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      title="Double-tap to open in Activity Tracker"
      className="bg-amber-500/10 border-l-4 border-amber-500 rounded-xl p-3 cursor-pointer select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider text-amber-500 font-semibold">
            <Zap className="w-3 h-3 fill-amber-500" />
            Critical · {openStep.label.toLowerCase()}
          </div>
          <div className="text-base font-semibold mt-0.5 truncate">
            {plan.activity_name || "Untitled plan"}
          </div>
          {plan.location && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="truncate hover:underline hover:text-foreground"
                title="Open in Google Maps"
              >
                {plan.location}
              </a>
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-0.5">
            {format(ts, "EEE p")} · {inFuture ? `in ${formatDistanceToNow(ts)}` : "now"}
          </div>
          {plan.notes && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.notes}</div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          aria-label="Dismiss until next lead-window step"
          title="Dismiss until next lead-window step"
          className="text-muted-foreground hover:text-foreground p-1 rounded-md flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
