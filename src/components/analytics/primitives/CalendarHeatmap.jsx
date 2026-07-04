import React, { useMemo } from "react";
import { dayKey, DAY_MS } from "@/lib/analytics/range";

// GitHub-style presence calendar — weeks as columns, Sun..Sat as rows.
//
// EXPLICITLY NOT A STREAK: empty days are neutral (muted, not red, no
// "broken" state anywhere) and the caller's copy celebrates days present
// rather than counting misses. Single-hue ramp (primary at varying
// opacity) so it stays readable for colorblind users; cells expose their
// date + count via title/aria-label rather than color alone.
//
// presentByDay: Map<"YYYY-MM-DD", count>
export default function CalendarHeatmap({
  presentByDay,
  weeks = 12,
  onDayClick = null,     // (dayKeyString) => void — amnesia aid: jump to that day
  className = "",
}) {
  const grid = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    // End the grid on the current week's Saturday so today is in the last column.
    const end = new Date(today.getTime() + (6 - today.getDay()) * DAY_MS);
    const cols = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const col = [];
      for (let d = 6; d >= 0; d--) {
        const cell = new Date(end.getTime() - (w * 7 + d) * DAY_MS);
        const key = dayKey(cell.getTime());
        const future = cell.getTime() > today.getTime();
        col.push({ key, future });
      }
      cols.push(col);
    }
    return cols;
  }, [weeks]);

  const maxCount = useMemo(() => {
    let m = 0;
    for (const v of (presentByDay?.values?.() ?? [])) m = Math.max(m, v);
    return m || 1;
  }, [presentByDay]);

  return (
    <div className={`overflow-x-auto no-scrollbar ${className}`}>
      <div className="flex gap-[3px] w-max" role="img" aria-label="Calendar of days with at least one log">
        {grid.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map(({ key, future }) => {
              const count = presentByDay?.get?.(key) || 0;
              const intensity = count > 0 ? 0.35 + 0.65 * Math.min(1, count / maxCount) : 0;
              const label = future ? "" : `${key}: ${count} ${count === 1 ? "entry" : "entries"}`;
              const Cell = onDayClick && !future ? "button" : "div";
              return (
                <Cell
                  key={key}
                  {...(Cell === "button" ? { type: "button", onClick: () => onDayClick(key), "aria-label": label } : {})}
                  title={label}
                  className={`w-3 h-3 rounded-[3px] ${future ? "opacity-0" : ""} ${Cell === "button" ? "cursor-pointer hover:ring-1 hover:ring-primary/60" : ""}`}
                  style={{
                    backgroundColor: count > 0 ? "hsl(var(--primary))" : "hsl(var(--muted))",
                    opacity: future ? 0 : count > 0 ? intensity : 0.45,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
