import { useRef, useCallback } from "react";

// After a tap/long-press fires, the platform still dispatches a synthetic
// `click`. If our handler navigated or re-rendered (e.g. breadcrumb
// drill-in), that click lands on whatever element is now under the finger
// — opening it by accident. Swallow exactly one click (capture phase)
// within a short window to kill that passthrough.
function swallowNextClick(windowMs = 600) {
  if (typeof document === "undefined") return;
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.removeEventListener("click", handler, true);
    clearTimeout(timer);
  };
  const handler = (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    cleanup();
  };
  const timer = setTimeout(cleanup, windowMs);
  document.addEventListener("click", handler, true);
}

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
    if (longFired.current) {
      // The long-press already fired; eat the trailing synthetic click.
      swallowNextClick();
    } else if (!moved.current) {
      // Real tap: swallow the trailing click BEFORE running onClick, so a
      // re-render/navigation in onClick can't let the click pass through
      // to the element that ends up under the finger.
      swallowNextClick();
      onClick?.(e);
    }
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
