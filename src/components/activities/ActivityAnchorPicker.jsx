// "Line up with…" — set an entry's time against another activity (owner
// ask, 2026-10-25: "I want to set the start/end time to before/after x").
//
// Opens on the planner's own day canvas (WeekCanvas, the same one the quick
// check-in's time strip uses), on the last day that has anything on it.
// Tap an activity → start right after it, end right before it, or start
// with it. Hold & drag on empty time (or stretch the entry's own block)
// sets a range directly, exactly like the check-in strip. The day can be
// stepped, widened to its week, or jumped to any date.
//
// Writes nothing: hands { start, minutes } back through onApply.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import WeekCanvas from "@/components/planner/WeekCanvas";
import { useT } from "@/lib/i18n";

const PENDING_ID = "anchor_pending_entry";
const HOUR_PX = 36;

const lengthOf = (a) => Number(a?.actual_duration_minutes) || Number(a?.duration_minutes) || 0;
const pad = (n) => String(n).padStart(2, "0");
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// The day to open on: the entry's own day when something else is on it,
// else the latest earlier day with an activity, else the entry's day.
export function lastActiveDay(activities, ref, excludeId = null) {
  const refDay = startOfDay(ref);
  let best = null;
  for (const a of activities || []) {
    if (!a?.timestamp || a.id === excludeId || a.status === "cancelled") continue;
    const t = new Date(a.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    const d = startOfDay(t);
    if (d > refDay) continue;
    if (!best || d > best) best = d;
    if (best.getTime() === refDay.getTime()) break;
  }
  return best || refDay;
}

export default function ActivityAnchorPicker({
  start, minutes, excludeId = null, name = "", color = null, weekStartsOn = 1, onApply, onClose,
}) {
  const tr = useT();
  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: () => base44.entities.Activity.list() });
  const baseLen = Number(minutes) > 0 ? Math.round(Number(minutes)) : 30;
  const [draft, setDraft] = useState(() => ({ start: new Date(start), minutes: baseLen }));
  // An entry with no length keeps none unless a range is drawn here.
  const [lenTouched, setLenTouched] = useState(false);
  const [day, setDay] = useState(null);
  const [week, setWeek] = useState(false);
  const [picked, setPicked] = useState(null);
  const shownDay = day || lastActiveDay(activities, start, excludeId);

  const blocks = useMemo(() => {
    const real = activities.filter((a) => a.timestamp && a.id !== excludeId);
    return [...real, {
      id: PENDING_ID,
      activity_name: name || tr("when.thisOne"),
      color: color || "#8b5cf6",
      status: "logged",
      timestamp: draft.start.toISOString(),
      duration_minutes: draft.minutes,
    }];
  }, [activities, excludeId, draft, name, color, tr]);

  const atDay = (d, min) => new Date(startOfDay(d).getTime() + Math.round(min) * 60000);
  const onCreate = (d, fromMin, toMin) => {
    setPicked(null);
    setLenTouched(true);
    setDraft({ start: atDay(d, fromMin), minutes: Math.max(5, Math.round(toMin - fromMin)) });
  };
  const onResize = (id, d, s, e) => {
    if (id !== PENDING_ID) return; // other entries stay put
    setLenTouched(true);
    setDraft({ start: atDay(d, s), minutes: Math.max(5, Math.round(e - s)) });
  };
  const onOpenBlock = (b) => {
    if (!b || b.id === PENDING_ID || !b.timestamp) return;
    setPicked(b);
  };

  const pStart = picked ? new Date(picked.timestamp) : null;
  const pLen = picked ? lengthOf(picked) : 0;
  const pEnd = pStart ? new Date(pStart.getTime() + pLen * 60000) : null;
  const lineUp = (how) => {
    if (!picked) return;
    if (how === "after") setDraft((d) => ({ ...d, start: pEnd }));
    else if (how === "before") setDraft((d) => ({ ...d, start: new Date(pStart.getTime() - d.minutes * 60000) }));
    else setDraft((d) => ({ ...d, start: pStart }));
    if (!isSameDay(shownDay, pStart) && !week) setDay(startOfDay(pStart));
  };

  // Open on the part of the day that matters: the first thing on it (or
  // this entry, when it's on that day), not midnight.
  const boxRef = useRef(null);
  const focusMin = useMemo(() => {
    const times = blocks
      .filter((b) => isSameDay(new Date(b.timestamp), shownDay))
      .map((b) => { const d = new Date(b.timestamp); return d.getHours() * 60 + d.getMinutes(); });
    return times.length ? Math.min(...times) : 9 * 60;
  }, [blocks, shownDay]);
  useEffect(() => {
    const scroller = boxRef.current?.querySelector(".overflow-y-auto");
    if (scroller) scroller.scrollTop = Math.max(0, (focusMin / 60) * HOUR_PX - 40);
    // Only when the day/span changes — not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownDay.getTime(), week, activities.length]);

  const draftEnd = new Date(draft.start.getTime() + draft.minutes * 60000);
  const anchor = new Date(shownDay); anchor.setHours(12, 0, 0, 0);

  return createPortal((
    <div className="fixed inset-0 z-[85] bg-black/50 flex items-end sm:items-center justify-center"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`bg-card w-full ${week ? "sm:max-w-2xl" : "sm:max-w-sm"} rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-2 max-h-full flex flex-col`}
        style={{ borderRadius: "var(--v2-radius, 16px)" }}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold flex-1">{tr("when.lineUpTitle")}</p>
          <button type="button" onClick={onClose} aria-label={tr("planner.close")}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[0.6875em] text-muted-foreground -mt-1">{tr("when.lineUpHint")}</p>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setPicked(null); setDay(addDays(shownDay, week ? -7 : -1)); }}
            aria-label={week ? tr("planner.prevWeek") : tr("when.prevDay")}
            className="p-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <input type="date" value={format(shownDay, "yyyy-MM-dd")} aria-label={tr("when.goToDay")}
            onChange={(e) => {
              const [y, mo, da] = String(e.target.value).split("-").map(Number);
              if (y && mo && da) { setPicked(null); setDay(new Date(y, mo - 1, da)); }
            }}
            className="flex-1 min-w-0 h-8 px-2 rounded-lg border border-input bg-background text-xs" />
          <button type="button" onClick={() => { setPicked(null); setDay(addDays(shownDay, week ? 7 : 1)); }}
            aria-label={week ? tr("planner.nextWeek") : tr("when.nextDay")}
            className="p-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground"><ChevronRight className="w-3.5 h-3.5" /></button>
          <div role="radiogroup" aria-label={tr("when.spanLabel")} className="flex rounded-full border border-border/60 p-0.5 gap-0.5 flex-shrink-0">
            {[[false, tr("when.spanDay")], [true, tr("when.spanWeek")]].map(([w, label]) => (
              <button key={label} type="button" role="radio" aria-checked={week === w} onClick={() => setWeek(w)}
                className={`text-[0.6875em] px-2.5 py-0.5 rounded-full ${week === w ? "bg-[var(--v2-accent)]/10 text-[var(--v2-accent)] font-semibold" : "text-muted-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div ref={boxRef} className="flex flex-col min-h-0 rounded-lg border border-border/50 overflow-hidden bg-background/60" style={{ height: 340 }}>
          <WeekCanvas
            anchor={anchor}
            dayCount={week ? 7 : 1}
            weekStartsOn={weekStartsOn}
            fill
            maxHeight={300}
            activities={blocks}
            onCreate={onCreate}
            onResize={onResize}
            onOpenBlock={onOpenBlock}
            // Its own zoom: pinching here must not resize the planner page.
            prefsOverride={{ hourPx: HOUR_PX, dayPx: week ? 44 : 120 }}
            onSetPref={() => {}}
          />
        </div>

        {picked ? (
          <div className="rounded-xl border border-border/60 p-2 space-y-1.5">
            <p className="text-xs truncate">
              <span className="font-semibold">{picked.activity_name || tr("planner.untitled")}</span>
              <span className="text-muted-foreground tabular-nums"> · {format(pStart, "EEE d")} {hm(pStart)}{pLen ? `–${hm(pEnd)}` : ""}</span>
            </p>
            <div className="flex flex-wrap gap-1">
              {pLen > 0 && (
                <button type="button" onClick={() => lineUp("after")}
                  className="text-xs px-2.5 py-1 rounded-full border border-border/50 hover:text-foreground">{tr("when.startAfter")}</button>
              )}
              <button type="button" onClick={() => lineUp("before")}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 hover:text-foreground">{tr("when.endBefore")}</button>
              <button type="button" onClick={() => lineUp("with")}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 hover:text-foreground">{tr("when.startWith")}</button>
            </div>
          </div>
        ) : (
          <p className="text-[0.6875em] text-muted-foreground">{tr("when.tapOne")}</p>
        )}

        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs tabular-nums text-muted-foreground">
            {format(draft.start, "EEE d MMM")} · {hm(draft.start)} → {hm(draftEnd)}
          </span>
          <Button size="sm" onClick={() => { onApply?.({ start: draft.start, minutes: lenTouched || Number(minutes) > 0 ? draft.minutes : minutes ?? null }); onClose?.(); }}>
            {tr("when.useTime")}
          </Button>
        </div>
      </div>
    </div>
  ), document.body);
}
