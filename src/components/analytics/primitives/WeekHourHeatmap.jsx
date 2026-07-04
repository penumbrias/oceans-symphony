import React, { useMemo } from "react";

// Weekday × hour grid heatmap (7 rows × 24 columns).
// Grid over radial: linear hour-of-day layouts are read more accurately
// than clock-style radials (see analytics-rebuild-plan memory). Single-hue
// intensity ramp + numeric tooltip per cell so color is never the only
// encoding. Used for switch timing (P2), reusable for check-in timing.
//
// cells: Map<"weekday-hour", count>  (weekday 0=Sun..6=Sat, hour 0..23)
export function whKey(weekday, hour) {
  return `${weekday}-${hour}`;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WeekHourHeatmap({ cells, thingLabel = "events", className = "" }) {
  const maxCount = useMemo(() => {
    let m = 0;
    for (const v of (cells?.values?.() ?? [])) m = Math.max(m, v);
    return m || 1;
  }, [cells]);

  return (
    <div className={`overflow-x-auto no-scrollbar ${className}`}>
      <div className="w-max">
        {/* Hour axis: label every 6h to stay quiet */}
        <div className="flex ml-9 mb-1">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-[13px] text-[0.5rem] text-muted-foreground text-center">
              {h % 6 === 0 ? h : ""}
            </div>
          ))}
        </div>
        {DAY_LABELS.map((label, wd) => (
          <div key={wd} className="flex items-center gap-0.5 mb-0.5">
            <span className="w-8 text-[0.625rem] text-muted-foreground text-right pr-1 flex-shrink-0">{label}</span>
            <div className="flex gap-[1px]">
              {Array.from({ length: 24 }, (_, h) => {
                const count = cells?.get?.(whKey(wd, h)) || 0;
                const intensity = count > 0 ? 0.3 + 0.7 * Math.min(1, count / maxCount) : 0;
                return (
                  <div
                    key={h}
                    title={`${label} ${String(h).padStart(2, "0")}:00 — ${count} ${thingLabel}`}
                    className="w-3 h-3 rounded-[2px]"
                    style={{
                      backgroundColor: count > 0 ? "hsl(var(--primary))" : "hsl(var(--muted))",
                      opacity: count > 0 ? intensity : 0.4,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
