import React, { useMemo } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday,
} from "date-fns";

function MiniMonth({ monthDate, byDay, maxMinutes, weekStartsOn, onMonthClick, onDayClick }) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const orderedLabels = [...dayLabels.slice(weekStartsOn), ...dayLabels.slice(0, weekStartsOn)];

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => onMonthClick?.(monthStart)}
        className="w-full text-center py-1 text-xs font-semibold bg-muted/40 hover:bg-muted/70 transition-colors"
      >
        {format(monthStart, "MMM")}
      </button>
      <div className="grid grid-cols-7 px-1 pt-0.5">
        {orderedLabels.map((l, i) => (
          <div key={i} className="text-[7px] text-muted-foreground/60 text-center">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px p-1 pt-0">
        {days.map(d => {
          const key = format(d, "yyyy-MM-dd");
          const list = byDay[key] || [];
          const totalMin = list.reduce((s, a) => s + (a.duration_minutes || 0), 0);
          const intensity = maxMinutes > 0 ? Math.min(1, totalMin / maxMinutes) : 0;
          const inMonth = isSameMonth(d, monthStart);
          const today = isToday(d);
          const bg = !inMonth
            ? "transparent"
            : intensity > 0
            ? `hsl(var(--primary) / ${0.15 + intensity * 0.65})`
            : "hsl(var(--muted) / 0.4)";
          return (
            <button
              key={key}
              type="button"
              onClick={(e) => { e.stopPropagation(); onDayClick?.(d); }}
              className={`aspect-square rounded-[2px] text-[7px] flex items-center justify-center hover:ring-1 hover:ring-primary/60 transition ${inMonth ? "text-foreground/80" : "text-transparent pointer-events-none"} ${today ? "ring-1 ring-primary" : ""}`}
              style={{ backgroundColor: bg }}
              title={inMonth ? `${format(d, "MMM d")} — ${totalMin >= 60 ? (totalMin / 60).toFixed(1) + "h" : totalMin + "m"}` : undefined}
            >
              {inMonth ? format(d, "d") : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Year view: 12 mini-month calendars in a 3x4 grid (4 cols on tablet+).
 * Each day cell is heatmap-tinted by total tracked minutes that day.
 * Tap a month header to drill into the month view; tap a day to open
 * that day's detail.
 */
export default function ActivityYearView({
  yearDate,
  activities = [],
  weekStartsOn = 0,
  onMonthClick,
  onDayClick,
}) {
  const year = yearDate.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));

  const byDay = useMemo(() => {
    const out = {};
    for (const a of activities) {
      if (!a?.timestamp) continue;
      const key = format(new Date(a.timestamp), "yyyy-MM-dd");
      (out[key] ||= []).push(a);
    }
    return out;
  }, [activities]);

  const maxMinutes = useMemo(() => {
    let max = 0;
    for (const list of Object.values(byDay)) {
      const total = list.reduce((s, a) => s + (a.duration_minutes || 0), 0);
      if (total > max) max = total;
    }
    return max;
  }, [byDay]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {months.map(m => (
        <MiniMonth
          key={m.toISOString()}
          monthDate={m}
          byDay={byDay}
          maxMinutes={maxMinutes}
          weekStartsOn={weekStartsOn}
          onMonthClick={onMonthClick}
          onDayClick={onDayClick}
        />
      ))}
    </div>
  );
}
