// Week canvas — Mon–Sun × 24h.
//
// Blocks are positioned from their real start/end (see lib/planner/layout.js).
// Nothing snaps to the hour row; only width responds to overlapping neighbours.
//
// Gestures:
//   press-hold 300ms on empty time → drag → release  : create (log if past, plan if future)
//   drag a block's top/bottom edge                   : change start/end
//   tap a block                                      : open it
//
// Overlays (off by default) draw other app data behind the blocks so you can
// see what lines up: fronting sessions as tinted bands, emotion check-ins as
// marks in the gutter edge. The timeline and check-in log remain the primary
// tools for that data.
//
// Reads Activity/FrontingSession/EmotionCheckIn. Writes nothing directly —
// creation and edits go through the existing modals, so stored data keeps
// exactly the shape it already has.

import React, { useMemo, useRef, useState, useCallback } from "react";
import { startOfWeek, addDays, isSameDay, format } from "date-fns";
import { layoutDay, occupiedMinutes, snap, MINUTES_PER_DAY } from "@/lib/planner/layout";

const HOLD_MS = 300;
const SLOP_PX = 8;

export const HOUR_PX = 44;

function minutesToLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// One day column. Owns its own pointer handling so a drag can't leak across
// days, and reports minutes rather than pixels so the parent never deals in
// geometry.
function DayColumn({
  day, blocks, untimed, overlayBands, overlayMarks,
  onCreate, onOpenBlock, onResize, colorFor, showOverlays, minWidth,
}) {
  const ref = useRef(null);
  const gesture = useRef(null);
  const [draft, setDraft] = useState(null);      // { fromMin, toMin }
  const [resizing, setResizing] = useState(null); // { id, edge, startMin, endMin }

  const minuteAt = useCallback((clientY) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return 0;
    const ratio = (clientY - box.top) / box.height;
    return Math.max(0, Math.min(MINUTES_PER_DAY, ratio * MINUTES_PER_DAY));
  }, []);

  const endGesture = useCallback(() => {
    if (gesture.current?.timer) clearTimeout(gesture.current.timer);
    gesture.current = null;
  }, []);

  const onPointerDown = (e) => {
    // Only the empty background arms creation — a press that starts on a
    // block belongs to that block.
    if (e.target.closest("[data-block]")) return;
    const startY = e.clientY;
    const startX = e.clientX;
    const startMin = minuteAt(startY);
    gesture.current = {
      armed: false, startX, startY, startMin,
      timer: setTimeout(() => {
        if (gesture.current) {
          gesture.current.armed = true;
          setDraft({ fromMin: snap(startMin), toMin: snap(startMin) + 30 });
          if (navigator.vibrate) navigator.vibrate(8);
        }
      }, HOLD_MS),
    };
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (g && !g.armed) {
      // Moved before the hold completed — that's a scroll, not a create.
      if (Math.abs(e.clientY - g.startY) > SLOP_PX || Math.abs(e.clientX - g.startX) > SLOP_PX) endGesture();
      return;
    }
    if (g?.armed) {
      e.preventDefault();
      const now = snap(minuteAt(e.clientY));
      setDraft({ fromMin: Math.min(g.startMin, now), toMin: Math.max(snap(g.startMin), now) });
      return;
    }
    if (resizing) {
      e.preventDefault();
      const now = snap(minuteAt(e.clientY));
      setResizing((r) => (r.edge === "top"
        ? { ...r, startMin: Math.min(now, r.endMin - 15) }
        : { ...r, endMin: Math.max(now, r.startMin + 15) }));
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    if (g?.armed && draft) {
      const from = draft.fromMin;
      const to = Math.max(draft.toMin, from + 15);
      onCreate(day, from, to);
    }
    if (resizing) onResize(resizing.id, day, resizing.startMin, resizing.endMin);
    endGesture();
    setDraft(null);
    setResizing(null);
  };

  const pct = (min) => `${(min / MINUTES_PER_DAY) * 100}%`;
  const live = resizing;

  return (
    <div className="flex-1 border-l border-border/40 first:border-l-0" style={{ minWidth }}>
      {/* Untimed strip — today's intentions, draggable down into the hours. */}
      <div className="min-h-[26px] border-b border-border/40 p-0.5 space-y-0.5">
        {untimed.map((u) => (
          <button key={u.id} type="button" onClick={() => onOpenBlock(u)}
            className="w-full text-left text-[0.625rem] leading-tight px-1 py-0.5 rounded truncate"
            style={{ background: `${colorFor(u)}22`, color: colorFor(u) }}>
            {u.activity_name || "Untitled"}
          </button>
        ))}
      </div>

      <div
        ref={ref}
        className="relative select-none"
        style={{ height: 24 * HOUR_PX, touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* hour rules */}
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="absolute left-0 right-0 border-t border-border/20"
            style={{ top: h * HOUR_PX }} />
        ))}

        {showOverlays.alters && overlayBands.map((b, i) => (
          <div key={`band-${i}`} className="absolute left-0 right-0 pointer-events-none"
            style={{ top: pct(b.startMin), height: pct(b.endMin - b.startMin), background: `${b.color}14` }} />
        ))}
        {showOverlays.emotions && overlayMarks.map((m, i) => (
          <div key={`mark-${i}`} className="absolute left-0 w-1.5 h-1.5 rounded-full pointer-events-none"
            style={{ top: pct(m.min), background: m.color }} title={m.label} />
        ))}

        {blocks.map((b) => {
          const isLive = live?.id === b.id;
          const top = isLive ? live.startMin : b.startMin;
          const bottom = isLive ? live.endMin : b.endMin;
          return (
            <div
              key={b.id}
              data-block
              className="absolute rounded-md overflow-hidden text-[0.625rem] leading-tight"
              style={{
                top: pct(top), height: pct(bottom - top),
                left: `${b.left * 100}%`, width: `calc(${b.width * 100}% - 2px)`,
                background: `${colorFor(b)}2e`,
                borderLeft: `2px solid ${colorFor(b)}`,
                opacity: b.status === "scheduled" ? 0.72 : 1,
                borderStyle: b.status === "scheduled" ? "dashed" : "solid",
              }}
            >
              {/* Edge handles — thin, and only on blocks tall enough to have
                  a middle left over for tapping. */}
              {bottom - top >= 30 && (
                <>
                  <div className="absolute inset-x-0 top-0 h-2 cursor-ns-resize"
                    onPointerDown={(e) => { e.stopPropagation(); setResizing({ id: b.id, edge: "top", startMin: b.startMin, endMin: b.endMin }); }} />
                  <div className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                    onPointerDown={(e) => { e.stopPropagation(); setResizing({ id: b.id, edge: "bottom", startMin: b.startMin, endMin: b.endMin }); }} />
                </>
              )}
              <button type="button" onClick={() => onOpenBlock(b)}
                className="w-full h-full text-left px-1 py-0.5">
                <span className="block truncate font-medium" style={{ color: colorFor(b) }}>
                  {b.activity_name || "Untitled"}
                </span>
                {bottom - top >= 40 && (
                  <span className="block truncate opacity-70">
                    {minutesToLabel(b.startMin)}–{minutesToLabel(b.endMin)}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {draft && (
          <div className="absolute left-0 right-0 rounded-md border-2 border-dashed border-primary bg-primary/15 pointer-events-none flex items-start justify-center"
            style={{ top: pct(draft.fromMin), height: pct(Math.max(draft.toMin - draft.fromMin, 15)) }}>
            <span className="text-[0.625rem] text-primary font-medium mt-0.5">
              {minutesToLabel(draft.fromMin)}–{minutesToLabel(Math.max(draft.toMin, draft.fromMin + 15))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WeekCanvas({
  anchor,
  weekStartsOn = 1,
  activities = [],
  frontingHistory = [],
  emotionCheckIns = [],
  alters = [],
  categoryColor = () => "#6366f1",
  overlays = { alters: false, emotions: false },
  onCreate,
  onOpenBlock,
  onResize,
}) {
  const days = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor, weekStartsOn]);

  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const colorFor = useCallback(
    (a) => a?.color || categoryColor(a?.parent_category_id) || "#6366f1",
    [categoryColor]
  );

  const perDay = useMemo(() => days.map((day) => {
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const sameDay = (t) => t && isSameDay(new Date(t), day);

    // Timed vs untimed: an entry with no timestamp is an intention for that
    // day, not a block. `planned_date` is how the existing quick plans mark
    // "this day, no time" — read both so nothing already stored is lost.
    const mine = activities.filter((a) => sameDay(a.timestamp) || sameDay(a.planned_date));
    const untimed = mine.filter((a) => !a.timestamp && a.planned_date);
    const timed = mine
      .filter((a) => a.timestamp)
      .map((a) => {
        const start = new Date(a.timestamp);
        const mins = Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 0;
        return { ...a, start, end: mins ? new Date(start.getTime() + mins * 60000) : null };
      });

    const laid = layoutDay(timed, dayStart);
    const bands = frontingHistory
      .filter((s) => s.start_time && (sameDay(s.start_time) || sameDay(s.end_time)))
      .map((s) => {
        const span = layoutDay([{ id: s.id, start: s.start_time, end: s.end_time }], dayStart)[0];
        const alter = alterById[s.alter_id || s.primary_alter_id];
        return span ? { startMin: span.startMin, endMin: span.endMin, color: alter?.color || "#94a3b8" } : null;
      })
      .filter(Boolean);
    const marks = emotionCheckIns
      .filter((c) => sameDay(c.timestamp))
      .map((c) => {
        const d = new Date(c.timestamp);
        return {
          min: d.getHours() * 60 + d.getMinutes(),
          color: c.is_distress ? "#ef4444" : "#22c55e",
          label: (c.emotions || []).join(", "),
        };
      });

    return { day, blocks: laid, untimed, bands, marks, total: occupiedMinutes(laid) };
  }), [days, activities, frontingHistory, emotionCheckIns, alterById]);

  const weekTotal = perDay.reduce((n, d) => n + d.total, 0);

  // A day column narrower than this can't hold a readable block, so on a
  // phone the week scrolls sideways rather than shrinking to slivers. The
  // Mon–Sun shape is kept either way.
  const MIN_DAY_PX = 74;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-baseline justify-between px-1 pb-1">
        <span className="text-xs text-muted-foreground">
          {format(days[0], "d MMM")} – {format(days[6], "d MMM")}
        </span>
        <span className="text-xs tabular-nums">{formatDuration(weekTotal)} tracked</span>
      </div>

      {/* One scroller for headers + grid so they can never drift apart. The
          hour gutter is sticky so it stays put while the week scrolls. */}
      <div className="overflow-x-auto overscroll-x-contain min-h-0">
        <div className="min-w-max">
          <div className="flex">
            <div className="w-10 flex-shrink-0 sticky left-0 z-20 bg-background" />
            {perDay.map(({ day, total }) => (
              <div key={day.toISOString()} className="text-center px-0.5 flex-1"
                style={{ minWidth: MIN_DAY_PX }}>
                <div className="text-[0.6875rem] font-medium leading-tight">
                  {format(day, "EEE")} {format(day, "d")}
                </div>
                <div className="text-[0.625rem] text-muted-foreground tabular-nums leading-tight">
                  {total ? formatDuration(total) : "—"}
                </div>
              </div>
            ))}
          </div>

          <div className="flex overflow-y-auto overscroll-contain min-h-0" style={{ maxHeight: "70vh" }}>
            <div className="w-10 flex-shrink-0 relative sticky left-0 z-20 bg-background" style={{ marginTop: 26 }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute right-1 text-[0.5625rem] text-muted-foreground tabular-nums"
                  style={{ top: h * HOUR_PX - 4 }}>
                  {String(h).padStart(2, "0")}
                </div>
              ))}
              <div style={{ height: 24 * HOUR_PX }} />
            </div>

            {perDay.map(({ day, blocks, untimed, bands, marks }) => (
              <DayColumn
                key={day.toISOString()}
                day={day}
                minWidth={MIN_DAY_PX}
                blocks={blocks}
                untimed={untimed}
                overlayBands={bands}
                overlayMarks={marks}
                showOverlays={overlays}
                colorFor={colorFor}
                onCreate={onCreate}
                onOpenBlock={onOpenBlock}
                onResize={onResize}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
