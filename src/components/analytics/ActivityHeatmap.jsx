import React from "react";
import { format, eachDayOfInterval, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";

export default function ActivityHeatmap({ sessions, from, to }) {
  // Build a map of date -> total fronting minutes
  const activityMap = {};
  for (const s of sessions) {
    const start = new Date(s.start_time);
    const end = s.end_time ? new Date(s.end_time) : new Date();
    const dateKey = format(start, "yyyy-MM-dd");
    const mins = (end - start) / 60000;
    activityMap[dateKey] = (activityMap[dateKey] || 0) + mins;
  }

  const maxActivity = Math.max(...Object.values(activityMap), 1);

  // Build weeks grid
  const startDay = startOfWeek(from, { weekStartsOn: 1 });
  const endDay = endOfWeek(to, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: startDay, end: endDay });

  // Group into weeks
  const weeks = [];
  let week = [];
  for (const day of days) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) weeks.push(week);

  const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

  function getColor(dateKey) {
    const val = activityMap[dateKey] || 0;
    if (val === 0) return "hsl(var(--muted))";
    const intensity = Math.min(val / maxActivity, 1);
    // purple scale
    const alpha = 0.15 + intensity * 0.85;
    return `hsla(265, 60%, 55%, ${alpha})`;
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">Activity Heatmap</h3>
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-0">
          {/* Weekday labels */}
          <div className="flex flex-col gap-1 pt-6">
            {weekdays.map((d, i) => (
              <div key={i} className="w-3 h-3 flex items-center justify-center text-[9px] text-muted-foreground">
                {i % 2 === 0 ? d : ""}
              </div>
            ))}
          </div>
          {/* Weeks */}
          {weeks.map((wk, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              <div className="h-5 flex items-center justify-center text-[9px] text-muted-foreground">
                {wi % 4 === 0 ? format(wk[0], "MMM") : ""}
              </div>
              {wk.map((day, di) => {
                const key = format(day, "yyyy-MM-dd");
                const mins = activityMap[key] || 0;
                const isInRange = day >= from && day <= to;
                return (
                  <div
                    key={di}
                    title={`${format(day, "MMM d")}: ${mins > 0 ? `${Math.round(mins)} min` : "No activity"}`}
                    className="w-3 h-3 rounded-sm transition-opacity"
                    style={{
                      backgroundColor: isInRange ? getColor(key) : "hsl(var(--muted)/0.4)",
                      opacity: isInRange ? 1 : 0.3,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {[0.1, 0.3, 0.5, 0.7, 1].map((v, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: `hsla(265, 60%, 55%, ${v})` }}
          />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </div>
  );
}