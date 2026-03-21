import React from "react";
import { format, eachDayOfInterval, startOfWeek, endOfWeek, parseISO } from "date-fns";

export default function DiaryHeatmap({ dailyAggregates, metric = "avg_emotional_misery" }) {
  if (!dailyAggregates.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">No diary data yet.</p>;
  }

  // Build a map of date -> value
  const valueMap = {};
  dailyAggregates.forEach((day) => {
    const value = day[metric];
    if (value !== undefined && value !== null) {
      valueMap[day.date] = value;
    }
  });

  const allValues = Object.values(valueMap);
  const maxValue = Math.max(...allValues, 1);
  const minValue = Math.min(...allValues, 0);

  const from = parseISO(dailyAggregates[0].date);
  const to = parseISO(dailyAggregates[dailyAggregates.length - 1].date);

  // Build weeks grid
  const startDay = startOfWeek(from, { weekStartsOn: 1 });
  const endDay = endOfWeek(to, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: startDay, end: endDay });

  const weeks = [];
  let week = [];
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push(week);

  const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

  function getColor(dateStr) {
    const val = valueMap[dateStr];
    if (val === undefined) return "hsl(var(--muted)/0.3)";
    const intensity = (val - minValue) / (maxValue - minValue || 1);
    // Orange scale
    const alpha = 0.2 + intensity * 0.8;
    return `hsla(40, 70%, 55%, ${alpha})`;
  }

  const metricLabel = {
    avg_emotional_misery: "Emotional Misery",
    avg_joy: "Joy",
    avg_physical_misery: "Physical Misery",
    avg_urge_self_harm: "Self-Harm Urge",
    total_skills: "Skills Practiced",
  }[metric] || metric;

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">{metricLabel} Calendar</h3>
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
                const dateStr = format(day, "yyyy-MM-dd");
                const val = valueMap[dateStr];
                const isInRange = day >= from && day <= to;
                return (
                  <div
                    key={di}
                    title={`${format(day, "MMM d")}: ${val !== undefined ? val.toFixed(1) : "No entry"}`}
                    className="w-3 h-3 rounded-sm transition-opacity"
                    style={{
                      backgroundColor: isInRange ? getColor(dateStr) : "hsl(var(--muted)/0.4)",
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
        <span className="text-[10px] text-muted-foreground">Low</span>
        {[0.1, 0.3, 0.5, 0.7, 1].map((v, i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `hsla(40, 70%, 55%, ${v})` }} />
        ))}
        <span className="text-[10px] text-muted-foreground">High</span>
      </div>
    </div>
  );
}