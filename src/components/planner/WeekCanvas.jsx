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
import { categoryIdOf } from "@/lib/planner/rollup";
import { useT } from "@/lib/i18n";

const HOLD_MS = 300;
const SLOP_PX = 8;

export const HOUR_PX = 44;
// Fixed so the hour gutter's offset always matches the grid. It used to be a
// min-height that grew with the day's untimed items, which slid the hour
// labels out of line with their own rows.
export const UNTIMED_STRIP_PX = 30;

function minutesToLabel(min) {
  const whole = Math.round(min);
  const h = Math.floor(whole / 60) % 24;
  const m = whole % 60;
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
  onAddToDay, onOpenUntimed, nowMin,
}) {
  const tr = useT();
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
    const node = ref.current;
    gesture.current = {
      armed: false, startX, startY, startMin: snap(startMin), pointerId: e.pointerId,
      timer: setTimeout(() => {
        if (!gesture.current) return;
        gesture.current.armed = true;
        // Take the pointer once the hold lands. Without this the browser
        // claims the gesture for scrolling the moment the finger moves and
        // fires pointercancel — which used to run the commit path, so the
        // modal opened as soon as you started dragging instead of when you
        // let go.
        try { node?.setPointerCapture(e.pointerId); } catch { /* mouse, or already captured */ }
        setDraft({ fromMin: snap(startMin), toMin: snap(startMin) + 30 });
        if (navigator.vibrate) navigator.vibrate(8);
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
      lastYRef.current = e.clientY;
      startAutoScroll();
      const now = snap(minuteAt(e.clientY));
      // Both ends are already snapped whole minutes, so the label can never
      // show a fraction and the block edges land on the grain.
      setDraft({ fromMin: Math.min(g.startMin, now), toMin: Math.max(g.startMin, now) });
      return;
    }
    if (resizing) {
      e.preventDefault();
      lastYRef.current = e.clientY;
      startAutoScroll();
      const now = snap(minuteAt(e.clientY));
      setResizing((r) => (r.edge === "top"
        ? { ...r, startMin: Math.min(now, r.endMin - 15) }
        : { ...r, endMin: Math.max(now, r.startMin + 15) }));
    }
  };

  // Release = commit. This is the ONLY path that creates anything.
  const onPointerUp = (e) => {
    const g = gesture.current;
    if (g?.pointerId != null) {
      try { ref.current?.releasePointerCapture(g.pointerId); } catch { /* already gone */ }
    }
    if (g?.armed && draft) {
      const from = draft.fromMin;
      const to = Math.max(draft.toMin, from + 15);
      onCreate(day, from, to);
    }
    if (resizing) onResize(resizing.id, day, resizing.startMin, resizing.endMin);
    stopAutoScroll();
    endGesture();
    setDraft(null);
    setResizing(null);
    if (e?.preventDefault) e.preventDefault();
  };

  // Cancel = throw the gesture away. Never commit.
  const onPointerCancel = () => {
    stopAutoScroll();
    endGesture();
    setDraft(null);
    setResizing(null);
  };

  // While a drag is live, a finger held near the top or bottom of the
  // scroll viewport scrolls it gradually — a duration isn't limited to the
  // hours that happen to be on screen. Works for create-drags and edge
  // resizes, in the page (the app's main scroller) and in a widget (the
  // canvas's own fill scroller): whichever scrollable ancestor is nearest.
  const lastYRef = useRef(0);
  const scrollLoopRef = useRef(null);
  const findScrollParent = () => {
    let n = ref.current?.parentElement;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };
  const stopAutoScroll = useCallback(() => {
    if (scrollLoopRef.current) cancelAnimationFrame(scrollLoopRef.current);
    scrollLoopRef.current = null;
  }, []);
  const startAutoScroll = useCallback(() => {
    if (scrollLoopRef.current) return;
    const scroller = findScrollParent();
    const EDGE = 48;   // px band near each edge that engages scrolling
    const MAX = 14;    // px per frame at the very edge
    const tick = () => {
      const active = gesture.current?.armed || resizingRef.current;
      if (!active) { scrollLoopRef.current = null; return; }
      const r = scroller === document.scrollingElement || scroller === document.documentElement
        ? { top: 0, bottom: window.innerHeight }
        : scroller.getBoundingClientRect();
      const y = lastYRef.current;
      let dy = 0;
      if (y > r.bottom - EDGE) dy = Math.min(MAX, ((y - (r.bottom - EDGE)) / EDGE) * MAX + 2);
      else if (y < r.top + EDGE) dy = -Math.min(MAX, (((r.top + EDGE) - y) / EDGE) * MAX + 2);
      if (dy !== 0) {
        scroller.scrollTop += dy;
        // The grid moved under the stationary finger — recompute the minute
        // from the same clientY so the selection keeps growing.
        const now = snap(minuteAt(y));
        if (gesture.current?.armed) {
          const startMin = gesture.current.startMin;
          setDraft({ fromMin: Math.min(startMin, now), toMin: Math.max(startMin, now) });
        } else if (resizingRef.current) {
          setResizing((prev) => (prev ? (prev.edge === "top"
            ? { ...prev, startMin: Math.min(now, prev.endMin - 15) }
            : { ...prev, endMin: Math.max(now, prev.startMin + 15) }) : prev));
        }
      }
      scrollLoopRef.current = requestAnimationFrame(tick);
    };
    scrollLoopRef.current = requestAnimationFrame(tick);
  }, [minuteAt]);
  // The rAF loop reads resize state without re-subscribing per frame.
  const resizingRef = useRef(null);
  React.useEffect(() => { resizingRef.current = resizing; }, [resizing]);
  React.useEffect(() => stopAutoScroll, [stopAutoScroll]);

  // React attaches touch listeners passively, so e.preventDefault() in the
  // pointer handler can't stop a scroll on its own. This one is explicit.
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const block = (e) => { if (gesture.current?.armed || resizing) e.preventDefault(); };
    node.addEventListener("touchmove", block, { passive: false });
    return () => node.removeEventListener("touchmove", block);
  }, [resizing]);

  const pct = (min) => `${(min / MINUTES_PER_DAY) * 100}%`;
  const live = resizing;
  // A day in the past is entirely behind us; today is behind us up to now;
  // a day ahead has nothing behind us yet.
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const thisDay = new Date(day); thisDay.setHours(0, 0, 0, 0);
  const pastMin = thisDay < startOfToday ? MINUTES_PER_DAY : (nowMin != null ? nowMin : 0);

  return (
    <div className="flex-1 border-l border-border/40 first:border-l-0" style={{ minWidth }}>
      {/* Untimed strip — today's intentions, draggable down into the hours. */}
      <div data-own-hold
        className="border-b border-border/40 p-0.5 space-y-0.5 overflow-y-auto relative group/strip"
        style={{ height: UNTIMED_STRIP_PX }}>
        {untimed.map((u) => (
          <button key={u.id} type="button" onClick={() => onOpenUntimed?.(u, day)}
            className="w-full text-left text-[0.625em] leading-tight px-1 py-0.5 rounded truncate"
            style={{ background: `${colorFor(u)}22`, color: colorFor(u) }}>
            {u.activity_name || tr("planner.untitled")}
          </button>
        ))}
        {/* Always reachable, even on a day that already has items — it sits
            over the strip rather than taking a row from it. */}
        <button type="button" onClick={() => onAddToDay?.(day)}
          aria-label={tr("planner.addToDay")}
          className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground opacity-60">
          <span className="text-[0.75em] leading-none">+</span>
        </button>
      </div>

      <div
        ref={ref}
        // This surface runs its own press-and-hold (create by dragging a time
        // range), so the widget shell must not ALSO arm its options sheet on
        // the same press — otherwise the sheet opens mid-drag, which reads as
        // the action firing before you let go.
        data-own-hold
        className="relative select-none"
        style={{ height: 24 * HOUR_PX, touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* hour rules */}
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="absolute left-0 right-0 border-t border-border/20"
            style={{ top: h * HOUR_PX }} />
        ))}

        {/* Time already spent reads back dimmer than time still ahead, so a
            glance separates "what happened" from "what's coming". Drawn
            under the blocks and inert. */}
        {pastMin > 0 && (
          <div className="absolute left-0 right-0 top-0 pointer-events-none"
            style={{ height: pct(pastMin), background: "rgb(0 0 0 / 0.16)" }} />
        )}
        {nowMin != null && (
          <div className="absolute left-0 right-0 z-10 pointer-events-none"
            style={{ top: pct(nowMin), borderTop: "2px solid var(--v2-accent, #ef4444)" }}>
            <span className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full"
              style={{ background: "var(--v2-accent, #ef4444)" }} />
          </div>
        )}

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
          // A block that crosses midnight is drawn as two pieces. The cut
          // edge is square (it continues, it doesn't end) and NOT
          // resizable — a resize commits "this day's minutes" as the whole
          // record, which would silently shorten an overnight sleep to the
          // part visible on this day. Whole-block resize spans two days
          // and can't be expressed with one day's handles.
          const spansDays = b.continuesBefore || b.continuesAfter;
          const r = "var(--v2-radius, 6px)";
          const realStart = b.start instanceof Date ? b.start : new Date(b.start);
          const realEnd = b.end ? (b.end instanceof Date ? b.end : new Date(b.end)) : null;
          const clockLabel = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          return (
            <div
              key={b.id}
              data-block
              className="absolute overflow-hidden text-[0.625em] leading-tight"
              style={{
                borderRadius: spansDays
                  ? `${b.continuesBefore ? 0 : r} ${b.continuesBefore ? 0 : r} ${b.continuesAfter ? 0 : r} ${b.continuesAfter ? 0 : r}`
                  : r,
                top: pct(top), height: pct(bottom - top),
                left: `${b.left * 100}%`, width: `calc(${b.width * 100}% - 2px)`,
                background: `${colorFor(b)}2e`,
                borderLeft: `2px solid ${colorFor(b)}`,
                opacity: (b.status === "scheduled" ? 0.72 : 1) * (bottom <= pastMin ? 0.78 : 1),
                borderStyle: b.status === "scheduled" ? "dashed" : "solid",
              }}
            >
              {/* Edge handles — thin, and only on blocks tall enough to have
                  a middle left over for tapping. */}
              {bottom - top >= 30 && !spansDays && (
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
                  {b.continuesBefore ? "↰ " : ""}{b.activity_name || tr("planner.untitled")}
                </span>
                {bottom - top >= 40 && (
                  <span className="block truncate opacity-70">
                    {/* Real clock times, so the piece on day 2 still says
                        "23:00–07:00", not "00:00–07:00". */}
                    {spansDays && realEnd
                      ? `${clockLabel(realStart)}–${clockLabel(realEnd)}`
                      : `${minutesToLabel(b.startMin)}–${minutesToLabel(b.endMin)}`}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {draft && (
          <div className="absolute left-0 right-0 border-2 border-dashed pointer-events-none flex items-start justify-center"
            style={{
              top: pct(draft.fromMin), height: pct(Math.max(draft.toMin - draft.fromMin, 15)),
              borderRadius: "var(--v2-radius, 6px)",
              borderColor: "var(--v2-accent)",
              background: "color-mix(in srgb, var(--v2-accent) 15%, transparent)",
            }}>
            <span className="text-[0.625em] font-medium mt-0.5" style={{ color: "var(--v2-accent)" }}>
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
  // 7 = the week; 1 = just the anchor day. Same canvas either way, so the
  // day widget and the week widget can't drift apart.
  dayCount = 7,
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
  onAddToDay,
  onOpenUntimed,
  maxHeight,
  fill = false,
}) {
  const days = useMemo(() => {
    if (dayCount === 1) return [new Date(anchor)];
    const start = startOfWeek(anchor, { weekStartsOn });
    return Array.from({ length: dayCount }, (_, i) => addDays(start, i));
  }, [anchor, weekStartsOn, dayCount]);

  // Re-render on the minute so the now line actually moves.
  const [nowTick, setNowTick] = useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const colorFor = useCallback(
    (a) => a?.color || categoryColor(categoryIdOf(a)) || "#6366f1",
    [categoryColor]
  );

  const perDay = useMemo(() => days.map((day) => {
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const sameDay = (t) => t && isSameDay(new Date(t), day);

    // Timed vs untimed: an entry with no timestamp is an intention for that
    // day, not a block. `planned_date` is how the existing quick plans mark
    // "this day, no time" — read both so nothing already stored is lost.
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000);
    const untimed = activities.filter((a) => !a.timestamp && sameDay(a.planned_date));
    // Timed blocks belong to EVERY day they touch, not just the day they
    // start — a sleep from 23:00 to 07:00 must draw on both days. The
    // layout engine (toSpan) already clips a block at midnight and marks
    // continuesBefore/After; it just never received the block on the
    // second day because bucketing was by start date alone.
    const timed = activities
      .filter((a) => a.timestamp)
      .map((a) => {
        const start = new Date(a.timestamp);
        const mins = Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 0;
        return { ...a, start, end: mins ? new Date(start.getTime() + mins * 60000) : null };
      })
      .filter((a) => {
        if (Number.isNaN(a.start.getTime())) return false;
        // Open-ended (no duration): only its start day.
        if (!a.end) return a.start >= dayStart && a.start < dayEnd;
        return a.start < dayEnd && a.end > dayStart;
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
  const MIN_DAY_PX = dayCount === 1 ? 0 : 74;

  return (
    <div className={`flex flex-col min-h-0 ${fill ? "h-full" : ""}`}>
      {/* One scroller for headers + grid so they can never drift apart. The
          hour gutter is sticky so it stays put while the week scrolls. */}
      <div className={`overflow-x-auto overscroll-x-contain min-h-0 ${fill ? "flex-1 flex flex-col" : ""}`}>
        <div className={`min-w-max ${fill ? "flex-1 flex flex-col min-h-0" : ""}`}>
          <div className="flex border-b border-border/60 pb-1 mb-0.5">
            <div className="w-10 flex-shrink-0 sticky left-0 z-20"
              style={{ background: "var(--v2-widget-bg, hsl(var(--background)))" }} />
            {perDay.map(({ day, total }) => {
              const today = isSameDay(day, new Date());
              return (
                <div key={day.toISOString()} className="text-center px-0.5 flex-1"
                  style={{ minWidth: MIN_DAY_PX }}>
                  <div className={`text-[0.6875em] leading-tight ${today ? "font-bold text-[var(--v2-accent)]" : "font-medium"}`}>
                    {format(day, "EEE")} {format(day, "d")}
                  </div>
                  <div className="text-[0.625em] text-muted-foreground tabular-nums leading-tight">
                    {total ? formatDuration(total) : "·"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Height is what's actually left on screen: the viewport minus this
              page's chrome above and the bottom nav below. A flat 70vh left
              the last hours of the day underneath the nav bar. */}
          {/* items-start: in a SCROLLING flex row, the default `stretch` sizes
              children to the container's visible height, not the content's —
              so each day column's left border stopped where the viewport did
              while the 24h grid inside kept going. Sizing to content makes
              the day separators run the full day. */}
          <div className={`flex items-start min-h-0 ${fill ? "flex-1 overflow-y-auto overscroll-contain" : ""}`}
            style={{
              paddingTop: 8,
              // `fill` = inside a widget box: take the box's height and
              // scroll within it. On the PAGE there is no inner cap at all —
              // the grid runs its full 24h and the page scrolls it, so the
              // planner isn't a small window onto itself.
              ...(fill && maxHeight ? { maxHeight } : {}),
            }}>
            <div className="w-10 flex-shrink-0 relative sticky left-0 z-20"
              style={{ marginTop: UNTIMED_STRIP_PX, background: "var(--v2-widget-bg, hsl(var(--background)))" }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute right-1 text-[0.5625em] text-muted-foreground tabular-nums"
                  style={{ top: h * HOUR_PX, transform: "translateY(-50%)" }}>
                  {String(h).padStart(2, "0")}
                </div>
              ))}
              <div style={{ height: 24 * HOUR_PX }} />
            </div>

            {perDay.map(({ day, blocks, untimed, bands, marks }) => (
              <DayColumn
                key={day.toISOString()}
                day={day}
                nowMin={isSameDay(day, nowTick) ? nowTick.getHours() * 60 + nowTick.getMinutes() : null}
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
                onAddToDay={onAddToDay}
                onOpenUntimed={onOpenUntimed}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
