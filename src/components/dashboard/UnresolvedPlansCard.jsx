import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import {
  ACTIVITY_STATUSES,
  isPastTimeScheduled,
} from "@/lib/activityStatus";

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

export default function UnresolvedPlansCard() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  const unresolved = useMemo(
    () => activities
      .filter(isPastTimeScheduled)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [activities]
  );

  const [busyId, setBusyId] = useState(null);

  if (unresolved.length === 0) return null;

  const resolve = async (act, status, extra = {}) => {
    setBusyId(act.id);
    try {
      await base44.entities.Activity.update(act.id, {
        status,
        ...extra,
      });
      toast.success(`Marked ${status}`);
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (err) {
      toast.error(err?.message || "Couldn't update plan");
    } finally {
      setBusyId(null);
    }
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
      </div>

      <div className="space-y-2">
        {visible.map((act) => (
          <div
            key={act.id}
            className="rounded-md border border-border/60 bg-card p-2 space-y-1.5"
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
                disabled={busyId === act.id}
                onClick={() => resolve(act, ACTIVITY_STATUSES.DONE)}
                className="h-7 text-xs px-2"
              >
                Done
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === act.id}
                onClick={() => resolve(act, ACTIVITY_STATUSES.PARTIAL)}
                className="h-7 text-xs px-2"
              >
                Partial
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === act.id}
                onClick={() => resolve(act, ACTIVITY_STATUSES.SKIPPED)}
                className="h-7 text-xs px-2"
              >
                Skipped
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === act.id}
                onClick={() => resolve(act, ACTIVITY_STATUSES.CANCELLED)}
                className="h-7 text-xs px-2"
              >
                Cancelled
              </Button>
            </div>
          </div>
        ))}
      </div>

      {!showInline && (
        <button
          type="button"
          onClick={() => navigate("/activities?tab=planned")}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          View all ({unresolved.length})
        </button>
      )}
    </Card>
  );
}
