// Press-and-hold a day, then drag across days to select a span — the
// calendar equivalent of the week grid's hold-and-drag over time blocks.
// Release opens whatever the caller wants (the Plan modal), with the first
// and last day of the span.
//
// Same technique as ActivityWeeklyGrid's drag-select: the hold arms it, the
// window-level pointermove resolves the day under the finger through
// elementFromPoint (per-cell pointerenter doesn't fire during touch once
// the origin element has captured the pointer), and touch-action is turned
// off while armed so the browser doesn't pan the page instead.

import { useCallback, useEffect, useRef, useState } from "react";

const dayKey = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export default function useDayRangeDrag({ onRangeSelect, holdMs = 450, enabled = true } = {}) {
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const timerRef = useRef(null);
  const originRef = useRef(null);
  const cellsRef = useRef(new Map());
  const movedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };
  useEffect(() => () => clearTimer(), []);

  const finish = useCallback(() => {
    if (!armedRef.current) return;
    armedRef.current = false;
    setArmed(false);
    const a = start;
    const b = end || start;
    setStart(null);
    setEnd(null);
    if (!a) return;
    const [from, to] = a <= b ? [a, b] : [b, a];
    onRangeSelect?.(from, to);
  }, [start, end, onRangeSelect]);

  useEffect(() => {
    if (!armed) return undefined;
    const move = (e) => {
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      if (x == null || y == null) return;
      const el = document.elementFromPoint(x, y);
      const cell = el?.closest?.("[data-day-key]");
      if (!cell) return;
      const d = cellsRef.current.get(cell.getAttribute("data-day-key"));
      if (!d) return;
      setEnd((prev) => (prev && dayKey(prev) === dayKey(d) ? prev : d));
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [armed, finish]);

  // Spread onto each day cell. Keeps the caller's own onClick working: the
  // hold only takes over once it has actually fired.
  const cellProps = useCallback((date) => {
    if (!enabled) return {};
    const key = dayKey(date);
    cellsRef.current.set(key, date);
    return {
      "data-day-key": key,
      style: armed ? { touchAction: "none" } : undefined,
      onPointerDown: (e) => {
        if (typeof e.button === "number" && e.button !== 0) return;
        movedRef.current = false;
        originRef.current = { x: e.clientX, y: e.clientY };
        clearTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          if (movedRef.current) return;
          armedRef.current = true;
          setArmed(true);
          setStart(date);
          setEnd(date);
        }, holdMs);
      },
      onPointerMove: (e) => {
        if (!originRef.current || armedRef.current) return;
        if (Math.abs(e.clientX - originRef.current.x) > 10 || Math.abs(e.clientY - originRef.current.y) > 10) {
          movedRef.current = true;
          clearTimer();
        }
      },
      onPointerUp: () => { clearTimer(); },
      onPointerLeave: () => { clearTimer(); },
      onContextMenu: (e) => { if (armedRef.current) e.preventDefault(); },
    };
  }, [enabled, armed, holdMs]);

  // True while this day is inside the span being dragged.
  const inRange = useCallback((date) => {
    if (!armed || !start) return false;
    const a = start, b = end || start;
    const [from, to] = a <= b ? [a, b] : [b, a];
    const t = new Date(date).setHours(12, 0, 0, 0);
    return t >= new Date(from).setHours(0, 0, 0, 0) && t <= new Date(to).setHours(23, 59, 59, 999);
  }, [armed, start, end]);

  // A tap that followed a hold shouldn't also fire the cell's onClick.
  const suppressClick = useCallback(() => armedRef.current, []);

  return { cellProps, inRange, dragging: armed, suppressClick };
}
