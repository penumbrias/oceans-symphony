// The planner's events, one row each (v0.348.0) — shown at the top of the
// Plans tab. A repeating event is ONE row with its cadence and next date,
// like a plan series. "+ Event" is the direct way in; the plan editor's
// "It's an event" switch is the other.

import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronRight, Repeat } from "lucide-react";
import EventSheet from "@/components/planner/EventSheet";
import { eventChipColor } from "@/components/planner/EventChips";
import { usePlannerEvents } from "@/lib/plannerEvents";
import { nextOccurrence, repeatOf, parseDayKey } from "@/lib/plannerEventDates";
import { useT } from "@/lib/i18n";

export default function EventsList() {
  const tr = useT();
  const events = usePlannerEvents();
  const [opened, setOpened] = useState(null);
  const rows = useMemo(() => events
    .map((ev) => ({ ev, next: nextOccurrence(ev) }))
    .sort((a, b) => {
      if (!a.next !== !b.next) return a.next ? -1 : 1;
      if (a.next && b.next) return a.next.date - b.next.date;
      return String(b.ev.date).localeCompare(String(a.ev.date));
    }), [events]);

  return (
    <div className="space-y-1" data-tour="planner-events">
      <div className="flex items-center justify-between gap-2 pt-0.5 px-0.5">
        <p className="text-[0.6875em] font-semibold uppercase tracking-wide text-muted-foreground">{tr("event.events")}</p>
        <button type="button" onClick={() => setOpened({ create: true })}
          className="text-xs px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground">
          {tr("event.add")}
        </button>
      </div>
      {rows.length === 0 && (
        <p className="text-[0.6875em] text-muted-foreground px-1">{tr("event.noneYet")}</p>
      )}
      {rows.map(({ ev, next }) => {
        const repeat = repeatOf(ev);
        const when = next ? next.date : parseDayKey(ev.date);
        return (
          <button key={ev.id} type="button"
            onClick={() => setOpened({ event: ev, occurrenceKey: next?.key || null })}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-border/50 text-left hover:bg-muted/30 ${next ? "" : "opacity-60"}`}
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: eventChipColor(ev) }} />
            <span className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate flex items-center gap-1.5">
                <span className="truncate">{ev.title}</span>
                {repeat !== "none" && (
                  <span className="text-[0.6875em] text-muted-foreground border border-border/50 rounded-full px-1.5 flex items-center gap-0.5 flex-shrink-0">
                    <Repeat className="w-2.5 h-2.5" />{tr(`event.repeat.${repeat}`)}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums block">
                {next
                  ? (repeat === "none" ? format(when, "EEE d MMM yyyy") : tr("event.next", { date: format(when, "EEE d MMM yyyy") }))
                  : `${when ? format(when, "d MMM yyyy") : ""} · ${tr("event.over")}`}
              </span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          </button>
        );
      })}
      {opened && <EventSheet request={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}

// "Today" / "Tomorrow" / "Fri 6 Nov" for an occurrence.
export function eventDayLabel(date, tr) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const days = Math.round((new Date(date).setHours(12, 0, 0, 0) - today.getTime()) / 86400000);
  if (days === 0) return tr("event.today");
  if (days === 1) return tr("event.tomorrow");
  return format(date, days < 7 ? "EEEE" : "EEE d MMM");
}

// Coming up occurrences (already picked by the caller), in the same row
// shape as the plans under them — the Coming up and Today widgets.
export function UpcomingEventRows({ occurrences = [] }) {
  const tr = useT();
  const [opened, setOpened] = useState(null);
  if (!occurrences.length) return null;
  return (
    <div className="space-y-1.5">
      {occurrences.map((occ) => (
        <button key={`${occ.event.id}-${occ.key}`} type="button"
          onClick={() => setOpened({ event: occ.event, occurrenceKey: occ.key })}
          className="w-full flex items-center gap-3 px-2 py-1.5 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left"
          style={{ borderLeftColor: eventChipColor(occ.event), borderLeftWidth: 3 }}>
          <span className="flex-1 min-w-0">
            <span className="text-sm font-medium truncate flex items-center gap-1.5">
              <span className="truncate">{occ.event.title}</span>
              <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground border border-border/50 rounded-full px-1.5 flex-shrink-0">
                {tr("event.kind")}
              </span>
            </span>
          </span>
          <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{eventDayLabel(occ.date, tr)}</span>
        </button>
      ))}
      {opened && <EventSheet request={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}
