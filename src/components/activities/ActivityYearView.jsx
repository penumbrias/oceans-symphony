import React, { useMemo } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday,
} from "date-fns";
import { countableMinutes, statusFor, visualForStatus } from "@/lib/activityStatus";
import useDayRangeDrag from "@/lib/useDayRangeDrag";
import { dayTagColor, taggedPlansForDay, textOn, tagRank, eventDotColor, dayActivityColor, softFill } from "@/lib/planTagColor";

// Events without a colour of their own get a faint theme colour, the same one
// the month view uses, so every event on a day still shows a dot.
const NO_COLOR_DOT = "hsl(var(--primary) / 0.4)";
const MAX_DOTS = 4;

// The colour of whatever took the most time that day — the month view shows
// logged activities in their own colour, so the year tints the day the same way.
function dominantActivityColor(list) {
  let best = null; let bestMin = 0;
  for (const a of list || []) {
    const mins = countableMinutes(a);
    if (a?.color && mins > bestMin) { best = a.color; bestMin = mins; }
  }
  return best;
}

// A day with events shows one dot per event (their own colour, or the faint
// theme one), like the month view — not a filled box.
function eventDots(list) {
  return [...(list || [])]
    .sort((x, y) => tagRank(x) - tagRank(y) || new Date(x.timestamp) - new Date(y.timestamp))
    .slice(0, MAX_DOTS)
    .map((a) => { const own = eventDotColor(a); return { id: a.id, color: own || NO_COLOR_DOT, opacity: (() => { const v = visualForStatus(statusFor(a)); return !own || v.dashed ? 1 : v.fillOpacity; })() }; });
}

function MiniMonth({ monthDate, byDay, maxMinutes, weekStartsOn, onMonthClick, onDayClick, drag }) {
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
          <div key={i} className="text-[0.4375rem] text-muted-foreground/60 text-center">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px p-1 pt-0">
        {days.map(d => {
          const key = format(d, "yyyy-MM-dd");
          const list = byDay[key] || [];
          const totalMin = list.reduce((s, a) => s + countableMinutes(a), 0);
          const intensity = maxMinutes > 0 ? Math.min(1, totalMin / maxMinutes) : 0;
          const inMonth = isSameMonth(d, monthStart);
          const today = isToday(d);
          // Plan color tag wins over the minutes heatmap: the highest-priority
          // tagged plan colors the box (time → daily → weekly → monthly → yearly).
          const tag = inMonth ? dayTagColor(list) : null;
          const tagNames = taggedPlansForDay(list).map((a) => a.activity_name || "Plan").join(", ");
          const actColor = inMonth ? (dominantActivityColor(list) || dayActivityColor(list, countableMinutes)) : null;
          const dots = inMonth ? eventDots(list) : [];
          // A tagged plan wins; else a logged activity tints the day in ITS
          // colour (as in the month view); else the theme heat-map.
          const bg = tag ? tag : !inMonth
            ? "transparent"
            : intensity > 0
            ? (actColor
              ? `color-mix(in srgb, ${actColor} ${Math.round(18 + intensity * 47)}%, transparent)`
              : `hsl(var(--primary) / ${0.15 + intensity * 0.65})`)
            : actColor
            ? softFill(actColor, 40)
            : "hsl(var(--muted) / 0.4)";
          return (
            <button
              key={key}
              type="button"
              {...(drag ? drag.cellProps(d) : {})}
              onClick={(e) => { e.stopPropagation(); if (!drag?.suppressClick()) onDayClick?.(d); }}
              className={`relative aspect-square rounded-[2px] text-[0.4375rem] flex items-center justify-center hover:ring-1 hover:ring-primary/60 transition ${inMonth ? "text-foreground/80" : "text-transparent pointer-events-none"} ${today ? "ring-1 ring-primary" : ""} ${drag?.inRange(d) ? "ring-1 ring-primary" : ""}`}
              style={{ backgroundColor: bg, ...(tag ? { color: textOn(tag) } : null), ...(drag?.dragging ? { touchAction: "none" } : null) }}
              title={inMonth ? `${format(d, "MMM d")} — ${totalMin >= 60 ? (totalMin / 60).toFixed(1) + "h" : totalMin + "m"}${tag ? ` — ${tagNames}` : ""}${list.length ? ` — ${list.map((a) => a.activity_name || "Plan").join(", ")}` : ""}` : undefined}
            >
              {inMonth ? format(d, "d") : ""}
              {dots.length > 0 && (
                <span className="absolute bottom-[1px] left-0 right-0 flex items-center justify-center gap-[1.5px] pointer-events-none">
                  {dots.map((dt) => (
                    <span key={dt.id} className="w-[3.5px] h-[3.5px] rounded-full" style={{ backgroundColor: dt.color, opacity: dt.opacity, boxShadow: "0 0 0 0.5px hsl(var(--background) / 0.7)" }} />
                  ))}
                </span>
              )}
              {inMonth && list.length > 1 && (
                <span
                  role="button"
                  aria-label={`${list.length} events — open the day`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onDayClick?.(d); }}
                  className="absolute -top-px -right-px w-[0.5625rem] h-[0.5625rem] rounded-full bg-background text-foreground border border-border/80 text-[0.4375rem] leading-none flex items-center justify-center"
                >
                  +
                </span>
              )}
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
 * that day's month.
 */
export default function ActivityYearView({
  yearDate,
  activities = [],
  weekStartsOn = 0,
  onMonthClick,
  onDayClick,
  onRangeSelect,
}) {
  const drag = useDayRangeDrag({ onRangeSelect, enabled: typeof onRangeSelect === "function" });
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
      const total = list.reduce((s, a) => s + countableMinutes(a), 0);
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
          drag={drag}
        />
      ))}
    </div>
  );
}
