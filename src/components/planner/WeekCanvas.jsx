// Week canvas — Mon–Sun × 24h.
//
// Blocks are positioned from their real start/end (see lib/planner/layout.js).
// Nothing snaps to the hour row; only width responds to overlapping neighbours.
//
// Gestures:
//   press-hold ~550ms on empty time → drag → release : create (log if past, plan if future)
//   press-hold ~400ms on a block edge → drag           : resize (ring shows it armed)
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
import { useTerms } from "@/lib/useTerms";
import { usePlannerPrefs, formatClock, formatHourLabel, HOUR_PX_DEFAULT, HOUR_PX_MIN, HOUR_PX_MAX, DAY_PX_MIN, DAY_PX_MAX } from "@/lib/planner/displayPrefs";
import { getActiveActivities, ACTIVE_ACTIVITY_EVENT, plannedEndMsFor } from "@/lib/activitySession";
import { getActiveSystemId } from "@/lib/systems";

// Hold lengths. Create fired too fast at 300ms ("I brushed the grid and
// got a draft"); 550ms reads as deliberate without feeling sluggish. An
// edge press already signals intent, so resize arms a little sooner.
const HOLD_MS = 550;
const RESIZE_HOLD_MS = 400;
const SLOP_PX = 8;

// Default row height; the live value is a preference (pinch / Display
// popover) — see displayPrefs.js.
export const HOUR_PX = HOUR_PX_DEFAULT;
// Fixed so the hour gutter's offset always matches the grid. It used to be a
// min-height that grew with the day's untimed items, which slid the hour
// labels out of line with their own rows.
export const UNTIMED_STRIP_PX = 30;

// Clock preference for the labels below. Set once per WeekCanvas render
// (module scope, single-threaded React) so DayColumn's helper closures
// don't each need the pref threaded through.
let _timeFmt = "24";
function minutesToLabel(min) { return formatClock(min, _timeFmt); }

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
  day, blocks, untimed, overlayBands, overlayMarks, onOpenBand, terms,
  onCreate, onOpenBlock, onResize, colorFor, showOverlays, minWidth,
  onAddToDay, onOpenUntimed, nowMin, hourPx = HOUR_PX_DEFAULT, onOpenMark, onOpenPage = null,
  laneOpacity = 90,
  // Cross-day creation: which column this is, and how to turn a pointer
  // x into a column index. Minutes are measured from THIS day's midnight,
  // so dragging into tomorrow simply carries past 1440 — the create sheet
  // already turns (to − from) into the duration, so a span of days needs
  // no new plumbing beyond letting the number grow.
  dayIndex = 0, dayIndexAt = null, registerNode = null,
}) {
  const tr = useT();
  const ref = useRef(null);
  const gesture = useRef(null);
  const [draft, setDraft] = useState(null);      // { fromMin, toMin }
  const [resizing, setResizing] = useState(null); // { id, edge, startMin, endMin }
  const resizeArm = useRef(null); // hold-to-arm edge resize: { timer, x, y, block, armed }
  // Which block has an edge press in progress (before the hold lands): drives
  // the faint "charging" ring so the user sees the hold registering.
  const [armingId, setArmingId] = useState(null);

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
    // Un-armed edge press that moves is a scroll — drop it (no open, no
    // resize).
    const ra = resizeArm.current;
    if (ra && !ra.armed) {
      if (Math.abs(e.clientY - ra.y) > SLOP_PX || Math.abs(e.clientX - ra.x) > SLOP_PX) cancelResizeArm();
      return;
    }
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
      const overIdx = dayIndexAt ? dayIndexAt(e.clientX) : dayIndex;
      // Only FORWARD across days: dragging back before the start would
      // invert the range, and the start is where the finger went down.
      const offset = Math.max(0, (overIdx == null ? dayIndex : overIdx) - dayIndex);
      const now = snap(minuteAt(e.clientY)) + offset * MINUTES_PER_DAY;
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

  // Hold-to-arm resize on a block's edge. Until the hold lands, the press
  // is treated as a tap (release → open the block) or a scroll (moved →
  // forget it). Only a held-still finger turns into a resize.
  const armResize = (e, spec, block) => {
    e.stopPropagation();
    if (e.button !== undefined && e.button !== 0) return;
    if (resizeArm.current?.timer) clearTimeout(resizeArm.current.timer);
    const node = ref.current;
    const pointerId = e.pointerId;
    setArmingId(block.id);
    resizeArm.current = {
      x: e.clientX, y: e.clientY, block, pointerId,
      timer: setTimeout(() => {
        if (!resizeArm.current) return;
        resizeArm.current.timer = null;
        resizeArm.current.armed = true;
        try { node?.setPointerCapture(pointerId); } catch { /* mouse */ }
        if (navigator.vibrate) navigator.vibrate(8);
        setArmingId(null);
        setResizing(spec);
      }, RESIZE_HOLD_MS),
    };
  };
  const cancelResizeArm = () => {
    if (resizeArm.current?.timer) clearTimeout(resizeArm.current.timer);
    resizeArm.current = null;
    setArmingId(null);
  };

  // Release = commit. This is the ONLY path that creates anything.
  const onPointerUp = (e) => {
    // A press on an edge that never became a hold is a TAP on the block:
    // open it, exactly like a press in the middle would.
    const ra = resizeArm.current;
    if (ra && !ra.armed) {
      cancelResizeArm();
      onOpenBlock(ra.block);
      return;
    }
    if (ra?.armed) {
      try { ref.current?.releasePointerCapture(ra.pointerId); } catch { /* gone */ }
      resizeArm.current = null;
    }
    setArmingId(null);
    const g = gesture.current;
    if (g?.pointerId != null) {
      try { ref.current?.releasePointerCapture(g.pointerId); } catch { /* already gone */ }
    }
    // Widget host: a press on empty time that never became a hold (a tap)
    // opens the full planner. On the page itself onOpenPage is null and a
    // tap on empty time does nothing, as before.
    if (g && !g.armed && onOpenPage) {
      stopAutoScroll();
      endGesture();
      setDraft(null);
      onOpenPage();
      return;
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
    cancelResizeArm();
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
        ref={(n) => { ref.current = n; registerNode?.(n); }}
        // This surface runs its own press-and-hold (create by dragging a time
        // range), so the widget shell must not ALSO arm its options sheet on
        // the same press — otherwise the sheet opens mid-drag, which reads as
        // the action firing before you let go.
        data-own-hold
        className="relative select-none"
        // pan-x AND pan-y: the week is wider than a phone and scrolls
        // sideways in the outer scroller — "pan-y" alone made the browser
        // refuse every horizontal swipe that began on a day column, so the
        // rest of the week was unreachable by touch. The hold-to-create
        // gesture doesn't need to own panning: it arms after HOLD_MS with
        // pointer capture and a passive:false touchmove blocker.
        // Pinch (two fingers) is left to the zoom handler below.
        style={{
          height: 24 * hourPx,
          touchAction: "pan-x pan-y",
          // A long-press must belong to OUR hold, not the browser's. Without
          // these, iOS/Android fire the text-selection callout ("Copy / Look
          // Up") on the block label under the finger ~500ms in, which cancels
          // the pointer and the hold "just disappears" (user report, twice).
          // `select-none` on the column wasn't enough: WebKit's callout is a
          // separate feature, and it applies to descendants (the block text)
          // regardless of the parent's user-select.
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        // The right-click / long-press context menu is the same problem on
        // Android Chrome. Never wanted anywhere on the canvas.
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* hour rules */}
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="absolute left-0 right-0 border-t border-border/20"
            style={{ top: h * hourPx }} />
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

        {/* Tappable — a bar you can't identify is decoration on a phone.
            The visible bar stays thin; the touch target is wider. */}
        {showOverlays.alters && overlayBands.map((b, i) => (
          <button key={`band-${i}`} type="button"
            aria-label={`${b.name} — ${terms?.fronting || "fronting"}`}
            onClick={(e) => { e.stopPropagation(); onOpenBand?.(b, e.currentTarget.getBoundingClientRect()); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute"
            // zIndex 0: the lanes sit UNDER the activity blocks (owner report — a
            // lane bar was drawn over a plan and read as covering it). Bands
            // render before blocks in the DOM, so equal stacking keeps blocks on top.
            style={{ top: pct(b.startMin), height: pct(b.endMin - b.startMin), left: (b.lane % 6) * 5, width: 8, zIndex: 0, background: "transparent" }}>
            <span className="block h-full" style={{ width: 3.5, marginLeft: 2, background: b.color, opacity: (laneOpacity ?? 90) / 100, borderRadius: 2 }} />
          </button>
        ))}
        {/* Check-in marks — tappable, so the log entry behind a dot is one
            tap away (a dot you can only hover is decoration on a phone). */}
        {showOverlays.emotions && overlayMarks.map((m, i) => (
          <button key={`mark-${i}`} type="button"
            aria-label={m.label ? `Check-in: ${m.label}` : "Check-in"}
            title={m.label}
            onClick={(e) => { e.stopPropagation(); onOpenMark?.(m); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-0 flex items-center justify-center"
            style={{ top: pct(m.min), width: 14, height: 14, transform: "translateY(-50%)", zIndex: 5 }}>
            <span className="block w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
          </button>
        ))}

        {blocks.map((b) => {
          const isLive = live?.id === b.id;
          const isArming = !isLive && armingId === b.id;
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
          const clockLabel = (d) => formatClock(d.getHours() * 60 + d.getMinutes(), _timeFmt);
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
                background: isLive ? `${colorFor(b)}55` : `${colorFor(b)}2e`,
                borderLeft: `2px solid ${colorFor(b)}`,
                opacity: isLive ? 1 : b._live && b.status !== "scheduled" ? 1
                  : (b.status === "scheduled" ? 0.72 : 1) * (bottom <= pastMin ? 0.78 : 1),
                borderStyle: b.status === "scheduled" ? "dashed" : "solid",
                // ARMED for resize: unmistakable "you're now editing this
                // block's time" — accent ring, richer fill, a hair of scale,
                // and it rides above its neighbours. Snaps back on release.
                ...(isLive ? {
                  boxShadow: "0 0 0 2px var(--v2-accent, hsl(var(--primary))), 0 6px 18px rgba(0,0,0,.25)",
                  transform: "scaleX(1.02)",
                  zIndex: 6,
                  transition: "box-shadow .12s ease-out, transform .12s ease-out, background .12s ease-out",
                } : isArming ? {
                  // Charging: the hold is registering. Faint ring now, full
                  // ring + fill the moment it arms.
                  boxShadow: "0 0 0 2px color-mix(in srgb, var(--v2-accent, hsl(var(--primary))) 45%, transparent)",
                  transition: "box-shadow .4s ease-out",
                } : { transition: "box-shadow .12s ease-out, transform .12s ease-out, background .12s ease-out" }),
              }}
            >
              {/* Edge handles — thin, and only on blocks tall enough to have
                  a middle left over for tapping. Resize is HOLD-to-arm on
                  the edge (same grammar as hold-to-create): a plain tap on
                  an edge opens the block like a tap anywhere else. Arming
                  instantly on pointerdown meant a thumb landing near an
                  edge resized the entry instead of opening it — silently
                  changing logged data by trying to LOOK at it. */}
              {bottom - top >= 30 && !spansDays && !b._live && (
                <>
                  <div className="absolute inset-x-0 top-0 h-2 cursor-ns-resize"
                    onPointerDown={(e) => armResize(e, { id: b.id, edge: "top", startMin: b.startMin, endMin: b.endMin }, b)} />
                  <div className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                    onPointerDown={(e) => armResize(e, { id: b.id, edge: "bottom", startMin: b.startMin, endMin: b.endMin }, b)} />
                </>
              )}
              <button type="button"
                onClick={() => (b._live ? (b._planRecord && onOpenBlock(b._planRecord)) : onOpenBlock(b))}
                className="w-full h-full text-left px-1 py-0.5"
                style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}>
                <span className="block truncate font-medium" style={{ color: colorFor(b) }}>
                  {b.continuesBefore ? "↰ " : ""}{b._live && b.status !== "scheduled" ? "▶ " : ""}{b.activity_name || tr("planner.untitled")}
                </span>
                {isLive && (
                  <span className="block truncate font-semibold" style={{ color: "var(--v2-accent, hsl(var(--primary)))" }}>
                    {minutesToLabel(top)}–{minutesToLabel(bottom)}
                  </span>
                )}
                {bottom - top >= 40 && !isLive && (
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
              top: pct(draft.fromMin),
              // The draft paints inside its own column; the label carries
              // the real end when the drag has run into later days.
              height: pct(Math.max(Math.min(draft.toMin, MINUTES_PER_DAY) - draft.fromMin, 15)),
              borderRadius: "var(--v2-radius, 6px)",
              borderColor: "var(--v2-accent)",
              background: "color-mix(in srgb, var(--v2-accent) 15%, transparent)",
            }}>
            <span className="text-[0.625em] font-medium mt-0.5" style={{ color: "var(--v2-accent)" }}>
              {minutesToLabel(draft.fromMin)}–{minutesToLabel(Math.max(draft.toMin, draft.fromMin + 15) % MINUTES_PER_DAY)}
              {draft.toMin >= MINUTES_PER_DAY && ` +${Math.floor(draft.toMin / MINUTES_PER_DAY)}d`}
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
  onOpenMark,
  onOpenBand,
  prefsOverride = null,
  onOpenPage = null,
  // Widget hosts: route pinch-zoom writes into the WIDGET's own config
  // instead of the shared preference — pinching one widget must not
  // resize every other planner surface (owner report).
  onSetPref = null,
}) {  const terms = useTerms();

  // Display prefs: row height (pinch or popover), clock format, week start.
  // Read live so a change anywhere re-renders every planner instance; a
  // widget's own config (prefsOverride) wins over the shared value.
  const [prefs, setPref] = usePlannerPrefs(prefsOverride);
  const hourPx = prefs.hourPx;
  _timeFmt = prefs.timeFmt;
  weekStartsOn = prefs.weekStartsOn;

  // Pinch-to-zoom (two-finger), on both axes: the vertical spread of the
  // fingers scales the HOUR height, the horizontal spread scales the DAY
  // width — so a mostly-vertical pinch zooms time, a mostly-horizontal one
  // widens the columns, and a diagonal one does both. Tracks the touches
  // itself; touch-action allows both pans, so the browser never claims a
  // two-finger gesture as page zoom (the app's viewport disables that).
  const dayPx = prefs.dayPx;
  const pinchRef = useRef(null);
  const onPinchStart = (e) => {
    if (e.touches?.length !== 2) return;
    const [a, b] = e.touches;
    pinchRef.current = {
      dx0: Math.max(24, Math.abs(a.clientX - b.clientX)),
      dy0: Math.max(24, Math.abs(a.clientY - b.clientY)),
      h0: hourPx, w0: dayPx,
    };
  };
  const onPinchMove = (e) => {
    const p = pinchRef.current;
    if (!p || e.touches?.length !== 2) return;
    e.preventDefault();
    const [a, b] = e.touches;
    const dx = Math.max(24, Math.abs(a.clientX - b.clientX));
    const dy = Math.max(24, Math.abs(a.clientY - b.clientY));
    const nextH = Math.round(Math.max(HOUR_PX_MIN, Math.min(HOUR_PX_MAX, p.h0 * (dy / p.dy0))));
    const nextW = Math.round(Math.max(DAY_PX_MIN, Math.min(DAY_PX_MAX, p.w0 * (dx / p.dx0))));
    const apply = onSetPref || setPref;
    if (nextH !== hourPx) apply("hourPx", nextH);
    if (nextW !== dayPx) apply("dayPx", nextW);
  };
  const onPinchEnd = () => { pinchRef.current = null; };

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

  // Running sessions (the Active-now store) draw ON the canvas: solid from
  // their start to the now line, and — when started from a plan with a
  // scheduled end — dashed with plan opacity from the now line to that end
  // (the unresolved-plan grammar). Past the scheduled end the solid piece
  // simply keeps following the now line until the session is ended.
  const [sessions, setSessions] = useState(() => getActiveActivities());
  React.useEffect(() => {
    const sync = () => setSessions(getActiveActivities());
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACTIVE_ACTIVITY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const colorFor = useCallback(
    (a) => a?.color || categoryColor(categoryIdOf(a)) || "#6366f1",
    [categoryColor]
  );

  let activeSystemIdRef = null;
  try { activeSystemIdRef = getActiveSystemId() || null; } catch { /* registry not up yet */ }
  // Column nodes, so a create-drag can resolve the pointer's x to a day
  // and run past midnight into the next one.
  const colNodes = useRef([]);
  const dayIndexAt = useCallback((clientX) => {
    const nodes = colNodes.current || [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      const r = n.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return i;
      // Past the last column's right edge — treat as that column, so a
      // finger dragged off the end still extends rather than snapping back.
      if (i === nodes.length - 1 && clientX > r.right) return i;
    }
    return null;
  }, []);

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
    // A plan that's been STARTED is rendered live (below) — its stored
    // block would double up with the live pieces.
    const livePlanIds = new Set(sessions.map((x) => x.planActivityId).filter(Boolean));
    const timed = activities
      .filter((a) => a.timestamp && !livePlanIds.has(a.id))
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

    // Live pieces for each running session.
    const now = nowTick;
    for (const sess of sessions) {
      const start = sess.startTime ? new Date(sess.startTime) : null;
      if (!start || Number.isNaN(start.getTime()) || start > now) continue;
      const plan = sess.planActivityId ? activities.find((a) => a.id === sess.planActivityId) : null;
      const foreign = sess.systemId && activeSystemIdRef && sess.systemId !== activeSystemIdRef;
      const name = (sess.name || plan?.activity_name || "Activity") + (foreign ? ` · ${sess.systemName || "another system"}` : "");
      const color = sess.color || plan?.color || null;
      const endMs = plannedEndMsFor(sess, plan);
      // Elapsed: solid, start → now (grows with the now line).
      if (now > dayStart && start < dayEnd) {
        timed.push({
          id: `live_${sess.id}`, activity_name: name, color,
          status: "logged", start, end: now,
          _live: true, _planRecord: plan || null,
          activity_category_ids: plan?.activity_category_ids || (sess.categoryId ? [sess.categoryId] : []),
        });
      }
      // Remaining scheduled time: dashed plan grammar, now → scheduled end.
      if (endMs && endMs > now.getTime()) {
        timed.push({
          id: `live_${sess.id}_rest`, activity_name: name, color,
          status: "scheduled", start: now, end: new Date(endMs),
          _live: true, _planRecord: plan || null,
          activity_category_ids: plan?.activity_category_ids || [],
        });
      }
    }

    const laid = layoutDay(timed, dayStart);
    // Front history exactly like the Timeline's alters column: one thin
    // LANE per alter, sessions as solid bars in their lane on the same
    // hour scale — the old full-width 8%-alpha washes blended into mud
    // and told you nothing.
    const laneOf = new Map();
    const bands = frontingHistory
      .filter((s) => {
        if (!s.start_time) return false;
        const st = new Date(s.start_time);
        const en = s.end_time ? new Date(s.end_time) : new Date();
        return st < dayEnd && en > dayStart;
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .map((s) => {
        const aid = s.alter_id || s.primary_alter_id;
        if (!laneOf.has(aid)) laneOf.set(aid, laneOf.size);
        const st = new Date(Math.max(new Date(s.start_time), dayStart));
        const en = new Date(Math.min(s.end_time ? new Date(s.end_time) : new Date(), dayEnd));
        const alter = alterById[aid];
        return {
          startMin: (st - dayStart) / 60000,
          endMin: Math.max((en - dayStart) / 60000, (st - dayStart) / 60000 + 6),
          color: alter?.color || "#94a3b8",
          lane: laneOf.get(aid),
          name: alter?.name || "?",
          alterId: aid,
          session: s,
        };
      })
      .filter((b) => b.endMin > b.startMin);
    const marks = emotionCheckIns
      .filter((c) => sameDay(c.timestamp))
      .map((c) => {
        const d = new Date(c.timestamp);
        return {
          id: c.id,
          checkIn: c,
          min: d.getHours() * 60 + d.getMinutes(),
          color: c.is_distress ? "#ef4444" : "#22c55e",
          label: (c.emotions || []).join(", "),
        };
      });

    return { day, blocks: laid, untimed, bands, marks, total: occupiedMinutes(laid) };
  }), [days, activities, frontingHistory, emotionCheckIns, alterById, sessions, nowTick]);

  const weekTotal = perDay.reduce((n, d) => n + d.total, 0);

  // A day column narrower than this can't hold a readable block, so on a
  // phone the week scrolls sideways rather than shrinking to slivers. The
  // Mon–Sun shape is kept either way.
  const MIN_DAY_PX = dayCount === 1 ? 0 : dayPx;

  return (
    <div className={`flex flex-col min-h-0 ${fill ? "h-full" : ""}`}>
      {/* One scroller for headers + grid so they can never drift apart. The
          hour gutter is sticky so it stays put while the week scrolls. */}
      <div className={`overflow-x-auto overscroll-x-contain min-h-0 ${fill ? "flex-1 flex flex-col" : ""}`}
        onTouchStart={onPinchStart} onTouchMove={onPinchMove} onTouchEnd={onPinchEnd} onTouchCancel={onPinchEnd}>
        <div className={`min-w-max ${fill ? "flex-1 flex flex-col min-h-0" : ""}`}>
          <div className="flex border-b border-border/60 pb-1 mb-0.5">
            <div className="w-10 flex-shrink-0 sticky left-0 z-20"
              style={{ background: "var(--v2-widget-bg, var(--color-bg))" }} />
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
          {/* No overscroll-contain here: reaching the bottom of the widget's
              own scroll must hand the gesture on to the page (the user had
              to find a gap beside the widget to keep scrolling home). The
              x axis stays contained above so a sideways swipe never turns
              into browser back-navigation. */}
          <div className={`flex items-start min-h-0 ${fill ? "flex-1 overflow-y-auto" : ""}`}
            style={{
              paddingTop: 8,
              // `fill` = inside a widget box: take the box's height and
              // scroll within it. On the PAGE there is no inner cap at all —
              // the grid runs its full 24h and the page scrolls it, so the
              // planner isn't a small window onto itself.
              ...(fill && maxHeight ? { maxHeight } : {}),
            }}>
            <div className="w-10 flex-shrink-0 relative sticky left-0 z-20"
              style={{ marginTop: UNTIMED_STRIP_PX, background: "var(--v2-widget-bg, var(--color-bg))" }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute right-1 text-[0.5625em] text-muted-foreground tabular-nums whitespace-nowrap"
                  style={{ top: h * hourPx, transform: "translateY(-50%)" }}>
                  {formatHourLabel(h, prefs.timeFmt)}
                </div>
              ))}
              <div style={{ height: 24 * hourPx }} />
            </div>

            {perDay.map(({ day, blocks, untimed, bands, marks }, dayIdx) => (
              <DayColumn
                key={day.toISOString()}
                day={day}
                dayIndex={dayIdx}
                dayIndexAt={dayIndexAt}
                registerNode={(n) => { colNodes.current[dayIdx] = n; }}
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
                hourPx={hourPx}
                onOpenMark={onOpenMark}
                onOpenBand={onOpenBand}
                terms={terms}
                onOpenPage={onOpenPage}
                laneOpacity={prefs.laneOpacity}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
