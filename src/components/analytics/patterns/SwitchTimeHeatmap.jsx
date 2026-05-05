import React, { useMemo } from "react";
import { computeSwitchTimeHeatmap } from "@/lib/analyticsEngine";

const PEAK_COLORS = [
  "bg-muted/20",           // 0
  "bg-orange-200/60",      // 1
  "bg-orange-300/70",      // 2
  "bg-orange-400/80",      // 3-4
  "bg-orange-500/90",      // 5-6
  "bg-red-500",            // 7+
];

function cellColor(count, max) {
  if (!count) return PEAK_COLORS[0];
  if (!max) return PEAK_COLORS[0];
  const ratio = count / max;
  if (ratio > 0.8) return PEAK_COLORS[5];
  if (ratio > 0.6) return PEAK_COLORS[4];
  if (ratio > 0.4) return PEAK_COLORS[3];
  if (ratio > 0.2) return PEAK_COLORS[2];
  return PEAK_COLORS[1];
}

export default function SwitchTimeHeatmap({ frontingSessions }) {
  const { matrix, dayLabels, hourLabels, max, total } = useMemo(
    () => computeSwitchTimeHeatmap(frontingSessions),
    [frontingSessions]
  );

  // Find peak hour and day
  let peakDay = 0, peakHour = 0;
  matrix.forEach((row, d) => {
    row.forEach((val, h) => {
      if (val > matrix[peakDay][peakHour]) { peakDay = d; peakHour = h; }
    });
  });

  if (!total) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No triggered switches recorded yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Mark switches as triggered in Quick Check-In to see time patterns.</p>
      </div>
    );
  }

  // Aggregate by hour (across all days) and by day (across all hours)
  const byHour = hourLabels.map((_, h) => matrix.reduce((s, row) => s + row[h], 0));
  const byDay = dayLabels.map((_, d) => matrix[d].reduce((s, v) => s + v, 0));

  const peakHours = byHour
    .map((c, h) => ({ h, c }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 3)
    .filter(x => x.c > 0);

  const peakDays = byDay
    .map((c, d) => ({ d, c }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 3)
    .filter(x => x.c > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        When do triggered switches happen? Darker cells = more switches at that day/time combination.
        This can reveal environmental or schedule-based patterns.
      </p>

      {/* Heatmap grid */}
      <div className="bg-card border border-border/50 rounded-xl p-3 overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Hour header */}
          <div className="flex mb-1">
            <div className="w-10 flex-shrink-0" />
            {hourLabels.map((label, h) => (
              <div key={h}
                className={`flex-1 text-center text-xs text-muted-foreground ${h % 3 !== 0 ? "opacity-0" : ""}`}
                style={{ minWidth: 20 }}>
                {label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {dayLabels.map((day, d) => (
            <div key={d} className="flex items-center mb-0.5">
              <div className="w-10 flex-shrink-0 text-xs text-muted-foreground text-right pr-2">{day}</div>
              {matrix[d].map((count, h) => (
                <div
                  key={h}
                  className={`flex-1 rounded-sm mx-px transition-all ${cellColor(count, max)}`}
                  style={{ minWidth: 18, height: 20 }}
                  title={count > 0 ? `${day} ${hourLabels[h]}: ${count} switch${count !== 1 ? "es" : ""}` : undefined}
                >
                  {count > 0 && max <= 5 && (
                    <span className="text-white text-xs font-bold flex items-center justify-center h-full leading-none">
                      {count}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Peak summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border/50 rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Most common days</p>
          {peakDays.map(({ d, c }) => (
            <div key={d} className="flex items-center justify-between py-0.5">
              <span className="text-sm font-medium">{dayLabels[d]}</span>
              <span className="text-xs text-muted-foreground">{c} switch{c !== 1 ? "es" : ""}</span>
            </div>
          ))}
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Most common times</p>
          {peakHours.map(({ h, c }) => (
            <div key={h} className="flex items-center justify-between py-0.5">
              <span className="text-sm font-medium">{hourLabels[h]}</span>
              <span className="text-xs text-muted-foreground">{c} switch{c !== 1 ? "es" : ""}</span>
            </div>
          ))}
        </div>
      </div>

      {max > 0 && (
        <div className="bg-muted/20 rounded-lg px-3 py-2">
          <p className="text-sm text-foreground">
            Peak time: <span className="font-semibold">{dayLabels[peakDay]}s around {hourLabels[peakHour]}</span>
            {" "}({matrix[peakDay][peakHour]} switch{matrix[peakDay][peakHour] !== 1 ? "es" : ""})
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">Based on {total} triggered switch{total !== 1 ? "es" : ""} across all recorded history.</p>
    </div>
  );
}
