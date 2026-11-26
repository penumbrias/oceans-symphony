// The kit's time columns (board 04-Planner's week): an hour gutter on the
// left, one column per day with its name on top and an "all day" row under
// the names, entries as blocks at their real times, a now line on today.
// The host hands in days whose blocks already carry their place
// ({ startMin, endMin, left, width } from layoutDay) and their tone; the
// columns draw them and report what the person did.
//
//   <TimeColumns label="Week of Nov 16" hourPx={34} hourLabel={(h) => "8 AM"}
//     days={[{ key, name, today, now, blocks: [{ key, startMin, endMin, left, width, tone, toneWords,
//              colour, label, time, movable }], allDay: [{ key, label, kind, colour }],
//              bands, marks }]}
//     onSelect={(block, dayIndex) => …}   onSelectAllDay={(item, dayIndex) => …}
//     onCreate={(dayIndex, fromMin, toMin) => …}   (press and drag on empty time)
//     onTapEmpty={(dayIndex, min) => …}             (a plain tap on empty time)
//     onMove={(block, dayIndex, startMin, endMin) => …} (drag a block, or its bottom edge)
//     onSelectMark={(mark) => …} scrollToHour={7} compact />
//
// Gestures. With a mouse: drag on empty time makes a range, drag a block
// moves it (to another day too), drag its bottom edge resizes it. With a
// finger: the same after holding still for a moment, so a swipe still
// scrolls. A tap opens. Every block is a button named by its words
// ("Walk, 5 PM, planned"), never by colour alone; moving by keyboard is
// the editor's job (Enter opens the block).

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { dragRange, dragBlock, TC_DAY_MINUTES } from "@/house/kit/timeColumnsModel";
import "@/house/kit/kit.css";
import "@/house/kit/timeColumns.css";

const HOLD_MS = 420;
const MOVE_PX = 6;

function Block({ block, hourPx, dragging, onPointerDown, onClick }) {
  const top = (block.startMin / 60) * hourPx;
  const h = Math.max(((block.endMin - block.startMin) / 60) * hourPx - 2, 18);
  const one = h < 34;
  const style = {
    top: `${top}px`, height: `${h}px`,
    left: `calc(${block.left * 100}% + 3px)`, width: `calc(${block.width * 100}% - 6px)`,
  };
  if (block.colour) style["--hk-tc-c"] = block.colour;
  const words = `${block.label}, ${block.time}${block.toneWords ? `, ${block.toneWords}` : ""}`;
  return (
    <button type="button" className="hk-tc-block" data-tone={block.tone} data-one={one || undefined}
      data-dragging={dragging || undefined} data-cont-before={block.continuesBefore || undefined}
      style={style} aria-label={words} title={words}
      onPointerDown={(e) => onPointerDown(e, block, "move")} onClick={onClick}>
      {block.mark ? <span className="hk-tc-mark" aria-hidden="true">{block.mark}</span> : null}
      <span className="hk-tc-time">{block.time}</span>
      {one ? " " : <br />}
      <span className="hk-tc-name">{block.label}</span>
      {block.movable ? (
        <span className="hk-tc-edge" aria-hidden="true" onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, block, "resize"); }} />
      ) : null}
    </button>
  );
}

export default function TimeColumns({
  label, days = [], hourPx = 34, hourLabel = (h) => String(h), hourStep = 2,
  onSelect, onSelectAllDay, onCreate, onTapEmpty, onMove, onSelectMark,
  scrollToHour = 7, compact = false, empty,
}) {
  const scrollRef = useRef(null);
  const colsRef = useRef([]);
  const gesture = useRef(null);
  const [draft, setDraft] = useState(null); // { dayIndex, fromMin, toMin } (new range)
  const [ghost, setGhost] = useState(null); // { key, dayIndex, startMin, endMin } (a block on the move)
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, scrollToHour * hourPx - 4);
    // Only on first draw and when the scale changes.
  }, [hourPx]); // eslint-disable-line react-hooks/exhaustive-deps

  const minAt = useCallback((dayIndex, clientY) => {
    const col = colsRef.current[dayIndex];
    if (!col) return 0;
    const r = col.getBoundingClientRect();
    return Math.max(0, Math.min(TC_DAY_MINUTES, ((clientY - r.top) / hourPx) * 60));
  }, [hourPx]);
  const dayAt = useCallback((clientX, fallback) => {
    for (let i = 0; i < colsRef.current.length; i += 1) {
      const c = colsRef.current[i];
      if (!c) continue;
      const r = c.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return i;
    }
    return fallback;
  }, []);

  // A finger needs the page to stop scrolling only once a drag has begun.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const stop = (e) => { if (gesture.current?.active) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  const begin = (e, payload) => {
    if (e.button != null && e.button !== 0) return;
    const touch = e.pointerType === "touch" || e.pointerType === "pen";
    const g = { ...payload, x: e.clientX, y: e.clientY, active: !touch, started: false, pointerId: e.pointerId, touch };
    if (touch) g.timer = setTimeout(() => { if (gesture.current === g) { g.active = true; navigator.vibrate?.(8); } }, HOLD_MS);
    gesture.current = g;
    const move = (ev) => {
      const cur = gesture.current;
      if (!cur || ev.pointerId !== cur.pointerId) return;
      const dx = ev.clientX - cur.x, dy = ev.clientY - cur.y;
      if (!cur.active) { if (Math.hypot(dx, dy) > MOVE_PX) { clearTimeout(cur.timer); gesture.current = null; detach(); } return; }
      if (!cur.started && Math.hypot(dx, dy) < MOVE_PX) return;
      cur.started = true;
      if (cur.kind === "create") {
        setDraft({ dayIndex: cur.dayIndex, ...dragRange(cur.min, minAt(cur.dayIndex, ev.clientY)) });
      } else {
        const delta = (dy / hourPx) * 60;
        const dayIndex = cur.mode === "move" ? dayAt(ev.clientX, cur.dayIndex) : cur.dayIndex;
        setGhost({ key: cur.block.key, dayIndex, ...dragBlock(cur.block, delta, cur.mode) });
      }
    };
    const up = (ev) => {
      const cur = gesture.current;
      detach();
      gesture.current = null;
      if (!cur) return;
      clearTimeout(cur.timer);
      if (cur.kind === "create") {
        if (cur.started) {
          const r = dragRange(cur.min, minAt(cur.dayIndex, ev.clientY));
          onCreate?.(cur.dayIndex, r.fromMin, r.toMin);
        } else onTapEmpty?.(cur.dayIndex, cur.min);
        setDraft(null);
        return;
      }
      if (cur.started) {
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 0);
        const delta = ((ev.clientY - cur.y) / hourPx) * 60;
        const dayIndex = cur.mode === "move" ? dayAt(ev.clientX, cur.dayIndex) : cur.dayIndex;
        const next = dragBlock(cur.block, delta, cur.mode);
        setGhost(null);
        if (next.startMin !== cur.block.startMin || next.endMin !== cur.block.endMin || dayIndex !== cur.dayIndex) {
          onMove?.(cur.block, dayIndex, next.startMin, next.endMin);
        }
      } else setGhost(null);
    };
    const cancel = () => { const cur = gesture.current; if (cur) clearTimeout(cur.timer); gesture.current = null; detach(); setDraft(null); setGhost(null); };
    function detach() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const hours = [];
  for (let h = 0; h < 24; h += hourStep) hours.push(h);
  const tall = 24 * hourPx;

  return (
    <div className="hk-tc" data-compact={compact || undefined} role="group" aria-label={label}
      style={{ "--hk-tc-n": days.length || 1, "--hk-tc-hour": `${hourPx}px` }}>
      <div className="hk-tc-head" aria-hidden={compact || undefined}>
        <span className="hk-tc-gutter" />
        {days.map((d) => (
          <span key={d.key} className="hk-tc-dayname" data-today={d.today || undefined}>{d.name}</span>
        ))}
      </div>
      <div className="hk-tc-allday">
        <span className="hk-tc-gutter hk-tc-allday-label">all day</span>
        {days.map((d, i) => (
          <span key={d.key} className="hk-tc-allday-cell">
            {(d.allDay || []).map((it) => (
              <button key={it.key} type="button" className="hk-tc-chip" data-kind={it.kind} data-tone={it.tone || undefined}
                style={it.colour ? { "--hk-tc-c": it.colour } : undefined}
                aria-label={`${d.name}: ${it.label}${it.kindWords ? `, ${it.kindWords}` : ""}`} title={it.label}
                onClick={() => onSelectAllDay?.(it, i)}>{it.label}</button>
            ))}
          </span>
        ))}
      </div>
      <div className="hk-tc-scroll" ref={scrollRef}>
        <div className="hk-tc-body" style={{ height: `${tall}px` }}>
          <div className="hk-tc-gutter hk-tc-hours" aria-hidden="true">
            {hours.map((h) => (
              <span key={h} className="hk-tc-hour" style={{ top: `${h * hourPx}px` }}>{h === 0 ? "" : hourLabel(h)}</span>
            ))}
          </div>
          {days.map((d, i) => (
            <div key={d.key} ref={(el) => { colsRef.current[i] = el; }} className="hk-tc-col" data-today={d.today || undefined}
              role="group" aria-label={d.name}
              onPointerDown={(e) => { if (e.target === e.currentTarget) begin(e, { kind: "create", dayIndex: i, min: minAt(i, e.clientY) }); }}>
              {(d.bands || []).map((b) => (
                <span key={b.key} className="hk-tc-band" aria-hidden="true" title={b.label}
                  style={{ top: `${(b.startMin / 60) * hourPx}px`, height: `${Math.max(3, ((b.endMin - b.startMin) / 60) * hourPx)}px`, left: `${b.lane * 4}px`, "--hk-tc-c": b.colour }} />
              ))}
              {d.blocks.map((b) => (ghost?.key === b.key ? null : (
                <Block key={b.key} block={b} hourPx={hourPx} dragging={false}
                  onPointerDown={(e, block, mode) => { if (block.movable) { e.stopPropagation(); begin(e, { kind: "block", block, mode, dayIndex: i }); } }}
                  onClick={() => { if (!suppressClick.current) onSelect?.(b, i); }} />
              )))}
              {ghost && ghost.dayIndex === i ? (() => {
                const src = days.flatMap((x) => x.blocks).find((x) => x.key === ghost.key);
                return src ? <Block block={{ ...src, startMin: ghost.startMin, endMin: ghost.endMin, left: 0, width: 1 }} hourPx={hourPx} dragging onPointerDown={() => {}} onClick={() => {}} /> : null;
              })() : null}
              {draft && draft.dayIndex === i ? (
                <span className="hk-tc-draft" aria-hidden="true"
                  style={{ top: `${(draft.fromMin / 60) * hourPx}px`, height: `${((draft.toMin - draft.fromMin) / 60) * hourPx}px` }} />
              ) : null}
              {(d.marks || []).map((m) => (
                <button key={m.key} type="button" className="hk-tc-markdot" data-kind={m.kind}
                  style={{ top: `${(m.min / 60) * hourPx}px`, "--hk-tc-c": m.colour }}
                  aria-label={m.label} title={m.label} onClick={() => onSelectMark?.(m)} />
              ))}
              {d.now != null ? <span className="hk-tc-now" style={{ top: `${d.now * tall}px` }} aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
      </div>
      {empty ? <div className="hk-tc-empty">{empty}</div> : null}
    </div>
  );
}
