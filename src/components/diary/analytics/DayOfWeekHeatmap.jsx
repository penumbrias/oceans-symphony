import React from "react";
import { format, parseISO, getDay } from "date-fns";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DayOfWeekHeatmap({ dailyAggregates, metric = "avg_emotional_misery" }) {
  if (!dailyAggregates.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">No data for this metric.</p>;
  }

  // Group by day of week and track values
  const byDayOfWeek = Array(7)
    .fill(null)
    .map(() => []);

  dailyAggregates.forEach((day) => {
    const date = parseISO(day.date);
    const dayOfWeek = getDay(date);
    const value = day[metric];
    if (value !== undefined && value !== null) {
      byDayOfWeek[dayOfWeek].push(value);
    }
  });

  // Calculate averages per day
  const dayStats = byDayOfWeek.map((values, dayIndex) => ({
    day: WEEKDAYS[dayIndex],
    dayIndex,
    values,
    avg: values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : null,
    count: values.length,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  }));

  const allValues = dailyAggregates
    .map((d) => d[metric])
    .filter((v) => v !== undefined && v !== null);
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);

  function getColor(value) {
    if (value === null) return "hsl(var(--muted)/0.5)";
    const intensity = (value - minVal) / (maxVal - minVal || 1);
    // Orange scale for intensity
    const alpha = 0.2 + intensity * 0.8;
    return `hsla(40, 70%, 55%, ${alpha})`;
  }

  const metricLabel = {
    avg_emotional_misery: "Emotional Misery",
    avg_joy: "Joy",
    avg_physical_misery: "Physical Misery",
    avg_urge_self_harm: "Self-Harm Urge",
  }[metric] || metric;

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-1">{metricLabel} by Day of Week</h3>
      <p className="text-xs text-muted-foreground mb-4">Pattern tracking — see which days tend to be harder</p>

      <div className="space-y-3">
        {dayStats.map((stat) => (
          <div key={stat.day} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium w-12">{stat.day}</span>
              <div className="flex-1 flex gap-1 px-3">
                {stat.values.map((val, i) => (
                  <div
                    key={i}
                    title={`${val.toFixed(1)}`}
                    className="flex-1 h-6 rounded transition-all"
                    style={{ backgroundColor: getColor(val) }}
                  />
                ))}
              </div>
              <div className="text-right w-16">
                {stat.avg !== null ? (
                  <div>
                    <p className="text-sm font-semibold">{stat.avg.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground">{stat.count} days</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground">
          <strong>Tip:</strong> Each bar represents a single occurrence. Wider sections = more frequent on that day.
        </p>
      </div>
    </div>
  );
}