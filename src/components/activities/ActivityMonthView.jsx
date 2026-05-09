import React, { useMemo } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, isSameDay,
} from "date-fns";

/**
 * Calendar-grid view of a single month. Each day cell shows colored bars or
 * dots representing activities logged that day, plus a heatmap-style
 * background tint scaled to the day's total tracked minutes.
 *
 * Tap a day to open the ActivityDayView via onDayClick.
 */
export default function ActivityMonthView({
  monthDate,
  activities = [],
  alters = [],
  weekStartsOn = 0,
  onDayClick,
  onActivityClick,
}) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Group activities by yyyy-MM-dd
  const byDay = useMemo(() => {
    const out = {};
    for (const a of activities) {
      if (!a?.timestamp) continue;
      const key = format(new Date(a.timestamp), "yyyy-MM-dd");
      (out[key] ||= []).push(a);
    }
    return out;
  }, [activities]);

  // Maximum minutes in any visible day, for relative heatmap scaling.
  const maxMinutes = useMemo(() => {
    let max = 0;
    for (const d of days) {
      const list = byDay[format(d, "yyyy-MM-dd")] || [];
      const total = list.reduce((s, a) => s + (a.duration_minutes || 0), 0);
      if (total > max) max = total;
    }
    return max;
  }, [days, byDay]);

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const orderedLabels = [...dayLabels.slice(weekStartsOn), ...dayLabels.slice(0, weekStartsOn)];

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="grid grid-cols-7 bg-muted/40 border-b border-border">
        {orderedLabels.map(l => (
          <div key={l} className="text-[11px] font-semibold text-muted-foreground text-center py-1.5 uppercase tracking-wider">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(d => {
          const key = format(d, "yyyy-MM-dd");
          const list = byDay[key] || [];
          const totalMin = list.reduce((s, a) => s + (a.duration_minutes || 0), 0);
          const intensity = maxMinutes > 0 ? Math.min(1, totalMin / maxMinutes) : 0;
          const inMonth = isSameMonth(d, monthStart);
          const today = isToday(d);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onDayClick?.(d)}
              className={`relative text-left border-b border-r border-border/40 p-1.5 min-h-[72px] transition-colors hover:bg-accent/40 ${inMonth ? "" : "bg-muted/20"}`}
              style={intensity > 0 ? { backgroundColor: `hsl(var(--primary) / ${0.06 + intensity * 0.18})` } : undefined}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold tabular-nums ${inMonth ? "text-foreground" : "text-muted-foreground/50"} ${today ? "bg-primary text-primary-foreground rounded-full w-5 h-5 inline-flex items-center justify-center" : ""}`}>
                  {format(d, "d")}
                </span>
                {totalMin > 0 && (
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    {totalMin >= 60 ? `${(totalMin / 60).toFixed(1)}h` : `${totalMin}m`}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-0.5">
                {list.slice(0, 6).map(a => (
                  <span
                    key={a.id}
                    onClick={(e) => { e.stopPropagation(); onActivityClick?.(a); }}
                    className="inline-block w-1.5 h-1.5 rounded-full cursor-pointer"
                    style={{ backgroundColor: a.color || "hsl(var(--primary))" }}
                    title={a.activity_name}
                  />
                ))}
                {list.length > 6 && (
                  <span className="text-[8px] text-muted-foreground leading-none">+{list.length - 6}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
