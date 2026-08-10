// The new planner. Separate from the old Activity tracker, which keeps
// working untouched until this replaces it.
//
// Reads and writes the SAME Activity records — no new entity, no migration.

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addWeeks, startOfWeek, format } from "date-fns";
import { ChevronLeft, ChevronRight, Users, Heart } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import WeekCanvas from "@/components/planner/WeekCanvas";
import ActivityLogModal from "@/components/activities/ActivityLogModal";
import ActivityPlanModal from "@/components/activities/ActivityPlanModal";
import ActivityDetailsModal from "@/components/activities/ActivityDetailsModal";
import { useTerms } from "@/lib/useTerms";
import { MINUTES_PER_DAY } from "@/lib/planner/layout";

const lsGet = (k, d) => {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
};
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export default function Planner() {
  const t = useTerms();
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  const [overlays, setOverlays] = useState(() => lsGet("symphony_planner_overlays_v1", { alters: false, emotions: false }));
  const [creating, setCreating] = useState(null);   // { day, fromMin, toMin, plan }
  const [opened, setOpened] = useState(null);

  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: () => base44.entities.Activity.list() });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: frontingHistory = [] } = useQuery({
    queryKey: ["frontingHistory"], queryFn: () => base44.entities.FrontingSession.list(),
    enabled: overlays.alters,
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list(),
    enabled: overlays.emotions,
  });

  const catColor = useMemo(() => {
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
    return (id) => byId[id]?.color || null;
  }, [categories]);

  const setOverlay = (key, on) => {
    const next = { ...overlays, [key]: on };
    setOverlays(next);
    lsSet("symphony_planner_overlays_v1", next);
  };

  const handleCreate = (day, fromMin, toMin) => {
    const start = new Date(day);
    start.setHours(Math.floor(fromMin / 60), fromMin % 60, 0, 0);
    // Future ranges are plans, past ranges are logs — the same split the
    // tracker already makes, so the right fields appear.
    setCreating({ day, fromMin, toMin, plan: start.getTime() > Date.now() });
  };

  // Dragging an edge only ever changes when it started and how long it ran.
  const handleResize = async (id, day, startMin, endMin) => {
    const activity = activities.find((a) => a.id === id);
    if (!activity) return;
    const start = new Date(day);
    start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    const minutes = Math.max(1, Math.min(MINUTES_PER_DAY, endMin - startMin));
    try {
      await base44.entities.Activity.update(id, {
        timestamp: start.toISOString(),
        // Keep whichever duration field this record already used.
        ...(activity.actual_duration_minutes != null
          ? { actual_duration_minutes: minutes }
          : { duration_minutes: minutes }),
      });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Couldn't move that"); }
  };

  const done = () => {
    setCreating(null);
    setOpened(null);
    qc.invalidateQueries({ queryKey: ["activities"] });
  };

  // Plain range rather than "w/c" — that's British shorthand for "week
  // commencing" and means nothing to most people.
  const weekLabel = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = new Date(start.getTime() + 6 * 86400000);
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${format(start, "d")}–${format(end, "d MMM")}`
      : `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
  }, [anchor]);
  // The canvas used to print its own range line under this one, saying the
  // same thing twice. One heading row.
  const weekTotalLabel = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = new Date(start.getTime() + 7 * 86400000);
    const mins = activities.reduce((n, a) => {
      const t = a.timestamp ? new Date(a.timestamp) : null;
      if (!t || t < start || t >= end) return n;
      return n + (Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 0);
    }, 0);
    const h = Math.floor(mins / 60), m = mins % 60;
    return mins ? `· ${h ? `${h}h ` : ""}${m ? `${m}m` : ""}`.trim() : "";
  }, [anchor, activities]);

  return (
    <div className="min-h-screen p-2 sm:p-4">
      <div className="os-page-shell space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label="Previous week" onClick={() => setAnchor((d) => addWeeks(d, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium tabular-nums">{weekLabel}</span>
            <Button variant="ghost" size="sm" aria-label="Next week" onClick={() => setAnchor((d) => addWeeks(d, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
            <span className="text-xs text-muted-foreground tabular-nums ml-1">{weekTotalLabel}</span>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOverlay("alters", !overlays.alters)}
              aria-pressed={overlays.alters}
              className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
                overlays.alters ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
              }`}>
              <Users className="w-3 h-3" /> {t.Fronting}
            </button>
            <button type="button" onClick={() => setOverlay("emotions", !overlays.emotions)}
              aria-pressed={overlays.emotions}
              className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
                overlays.emotions ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
              }`}>
              <Heart className="w-3 h-3" /> Check-ins
            </button>
          </div>
        </div>

        <WeekCanvas
          anchor={anchor}
          activities={activities}
          frontingHistory={frontingHistory}
          emotionCheckIns={emotionCheckIns}
          alters={alters}
          categoryColor={catColor}
          overlays={overlays}
          onCreate={handleCreate}
          onOpenBlock={setOpened}
          onResize={handleResize}
        />
      </div>

      {creating && !creating.plan && (
        <ActivityLogModal
          isOpen
          onClose={() => setCreating(null)}
          startDate={creating.day}
          endDate={creating.day}
          startHour={Math.floor(creating.fromMin / 60)}
          startMinute={creating.fromMin % 60}
          endHour={Math.floor(creating.toMin / 60)}
          endMinute={creating.toMin % 60}
          alters={alters}
          onSave={done}
        />
      )}
      {creating && creating.plan && (
        <ActivityPlanModal
          isOpen
          onClose={() => setCreating(null)}
          startDate={creating.day}
          endDate={creating.day}
          startHour={Math.floor(creating.fromMin / 60)}
          startMinute={creating.fromMin % 60}
          endHour={Math.floor(creating.toMin / 60)}
          endMinute={creating.toMin % 60}
          alters={alters}
          onSave={done}
        />
      )}
      {opened && (
        <ActivityDetailsModal
          isOpen
          activity={opened}
          alters={alters}
          onClose={() => setOpened(null)}
          onSave={done}
        />
      )}
    </div>
  );
}
