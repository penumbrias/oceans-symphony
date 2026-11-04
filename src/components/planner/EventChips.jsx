// One day's planner events as small chips (v0.348.0) — the planner's day
// headers, the timeline's day headers and anywhere else a day is drawn.
// Tapping a chip opens that date of the event in the shared EventSheet.
//
// Chips are spans with role="button" (not <button>) because several hosts
// draw them inside a day header that is itself a button; the tap stops
// there so it doesn't also fold the day or open it.
//
// `compact` (narrow week columns): the name only, truncated.

import React, { useMemo, useState } from "react";
import EventSheet from "@/components/planner/EventSheet";
import { usePlannerEvents } from "@/lib/plannerEvents";
import { eventsOnDay } from "@/lib/plannerEventDates";
import { normalizeHex } from "@/lib/planTagColor";

export function eventChipColor(ev) {
  return normalizeHex(ev?.tag_color || "") || "var(--v2-accent, var(--color-primary, #6366f1))";
}

export default function EventChips({ day, compact = false, className = "" }) {
  const events = usePlannerEvents();
  const list = useMemo(() => eventsOnDay(events, day), [events, day]);
  const [opened, setOpened] = useState(null);
  if (!list.length) return null;
  const open = (e, occ) => {
    e.stopPropagation();
    e.preventDefault();
    setOpened({ event: occ.event, occurrenceKey: occ.key });
  };
  return (
    <>
      <span className={`flex flex-wrap gap-0.5 ${className}`}>
        {list.map((occ) => {
          const color = eventChipColor(occ.event);
          return (
            <span key={`${occ.event.id}-${occ.key}`} role="button" tabIndex={0}
              onClick={(e) => open(e, occ)}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(e, occ); }}
              title={occ.event.title}
              className={`inline-flex items-center gap-1 max-w-full min-w-0 text-[0.625em] leading-tight py-px rounded-full border cursor-pointer ${compact ? "px-1" : "px-1.5"}`}
              style={{ borderColor: color, color, background: "color-mix(in srgb, currentColor 12%, transparent)" }}>
              {!compact && <span aria-hidden className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />}
              <span className="font-medium truncate">{occ.event.title}</span>
            </span>
          );
        })}
      </span>
      {opened && <EventSheet request={opened} onClose={() => setOpened(null)} />}
    </>
  );
}
