import { useRef, useCallback } from "react";

// Press-and-hold detection that is safe to attach to scrollable lists.
// - Fires `onLongPress` after `ms` (default 400ms) of a stationary press.
// - Fires `onClick` on a quick tap that didn't long-press and didn't move.
// - CANCELS on any pointer movement beyond `moveTolerance` px, so scrolling
//   the list never triggers either action (the accidental-click safeguard).
//
// Uses Pointer Events, which cover both touch and mouse in the Capacitor
// WebView and the browser. Spread the returned handlers onto the element
// and DO NOT also pass an onClick — this hook owns the tap.
export default function useLongPress({ onLongPress, onClick, ms = 400, moveTolerance = 10 } = {}) {
  const timer = useRef(null);
  const start = useRef(null);
  const longFired = useRef(false);
  const moved = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const onPointerDown = useCallback((e) => {
    if (typeof e.button === "number" && e.button !== 0) return; // primary only
    longFired.current = false;
    moved.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      if (moved.current) return;
      longFired.current = true;
      onLongPress?.(e);
    }, ms);
  }, [clearTimer, ms, onLongPress]);

  const onPointerMove = useCallback((e) => {
    if (!start.current) return;
    const dx = Math.abs(e.clientX - start.current.x);
    const dy = Math.abs(e.clientY - start.current.y);
    if (dx > moveTolerance || dy > moveTolerance) {
      moved.current = true;
      clearTimer();
    }
  }, [clearTimer, moveTolerance]);

  const onPointerUp = useCallback((e) => {
    clearTimer();
    if (!longFired.current && !moved.current) onClick?.(e);
    start.current = null;
  }, [clearTimer, onClick]);

  const onPointerLeave = useCallback(() => {
    clearTimer();
    start.current = null;
  }, [clearTimer]);

  const onKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(e); }
  }, [onClick]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onKeyDown };
}
