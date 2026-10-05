// A thin one-day planner column for picking WHEN an activity happened —
// the quick check-in's activity section docks it on its right edge.
//
// It is the planner's own day canvas (WeekCanvas with dayCount 1), not a
// look-alike, so the grammar is the one people already know from the
// planner: press and hold on empty time, drag, release → that range. Hold
// an edge of the chosen block to stretch it. The day's existing entries
// draw behind it for context; they're read-only here (this strip only
// ever reports a range for the activity being logged — it writes nothing).

import React, { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { isSameDay } from "date-fns";
import { base44 } from "@/api/base44Client";
import WeekCanvas from "@/components/planner/WeekCanvas";

export const PENDING_PREFIX = "qc_pending_";
// Compact rows so a good slice of the day fits in a thin strip.
const STRIP_HOUR_PX = 30;

export default function ActivityTimeStrip({
  day,                // Date — which day to draw
  pending = [],       // [{ id, name, color, start: Date, minutes, focused }]
  categoryColor = () => "#8b5cf6",
  onPick,             // (id, startDate, minutes) — a range was drawn/resized
  onFocus,            // (id) — a pending block was tapped
  height = 320,
}) {
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  const anchor = useMemo(() => { const d = new Date(day); d.setHours(12, 0, 0, 0); return d; }, [day]);
  const dayStart = useMemo(() => { const d = new Date(day); d.setHours(0, 0, 0, 0); return d; }, [day]);

  // The day's real entries (context) + the activity being logged, drawn as
  // a block of its own so its range can be seen and stretched.
  const blocks = useMemo(() => {
    const real = activities.filter((a) => {
      if (!a.timestamp) return false;
      const t = new Date(a.timestamp);
      return !Number.isNaN(t.getTime()) && Math.abs(t - dayStart) < 2 * 86400000;
    });
    const mine = pending
      .filter((p) => p.start && p.minutes > 0)
      .map((p) => ({
        id: `${PENDING_PREFIX}${p.id}`,
        activity_name: p.name,
        color: p.color,
        status: "logged",
        timestamp: p.start.toISOString(),
        duration_minutes: p.minutes,
      }));
    return [...real, ...mine];
  }, [activities, pending, dayStart]);

  const target = pending.find((p) => p.focused) || pending[pending.length - 1] || null;

  const minutesToDate = (min) => new Date(dayStart.getTime() + Math.round(min) * 60000);

  const handleCreate = (d, fromMin, toMin) => {
    if (!target) return;
    onPick?.(target.id, minutesToDate(fromMin), Math.max(5, Math.round(toMin - fromMin)));
  };
  const handleResize = (id, d, startMin, endMin) => {
    if (typeof id !== "string" || !id.startsWith(PENDING_PREFIX)) return; // existing entries stay put
    onPick?.(id.slice(PENDING_PREFIX.length), minutesToDate(startMin), Math.max(5, Math.round(endMin - startMin)));
  };
  const handleOpen = (b) => {
    if (typeof b?.id === "string" && b.id.startsWith(PENDING_PREFIX)) onFocus?.(b.id.slice(PENDING_PREFIX.length));
  };

  // Open on the part of the day that matters: the chosen range if there is
  // one, otherwise now (today) or mid-morning (another day).
  const boxRef = useRef(null);
  const scrollKey = target?.start ? target.start.getTime() : `${dayStart.getTime()}`;
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const scroller = box.querySelector(".overflow-y-auto");
    if (!scroller) return;
    let focusMin;
    if (target?.start) focusMin = (target.start - dayStart) / 60000;
    else if (isSameDay(dayStart, new Date())) { const n = new Date(); focusMin = n.getHours() * 60 + n.getMinutes(); }
    else focusMin = 9 * 60;
    scroller.scrollTop = Math.max(0, (focusMin / 60) * STRIP_HOUR_PX - height / 3);
    // Only when the day or the chosen start changes — not on every redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  return (
    <div ref={boxRef} className="flex flex-col min-h-0 rounded-lg border border-border/50 overflow-hidden bg-background/60"
      style={{ height }}>
      <WeekCanvas
        anchor={anchor}
        dayCount={1}
        fill
        maxHeight={height - 44}
        activities={blocks}
        categoryColor={categoryColor}
        onCreate={handleCreate}
        onResize={handleResize}
        onOpenBlock={handleOpen}
        // This strip's zoom is its own — pinching it must not resize the
        // planner page or its widgets.
        prefsOverride={{ hourPx: STRIP_HOUR_PX, dayPx: 56 }}
        onSetPref={() => {}}
      />
    </div>
  );
}
