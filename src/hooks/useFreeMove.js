// Free placement: hold a widget, drag it to a cell, let go.
//
// The sortable canvas can only reorder — widgets pack against each other and
// the user can never leave a deliberate gap. This hook is the other half:
// it moves a widget to the grid cell under the pointer, so a page can be
// arranged rather than merely ordered.
//
// It deliberately does NOT use dnd-kit. Sortable's model is "which item am I
// before/after", and the whole point here is "which cell am I on".
//
// Gesture matches the rest of edit mode: 300ms stationary hold to lift (a
// moving finger is a scroll and never lifts anything), pointer capture so
// the release always comes back to us, and a drop onto the remove target
// deletes — same as flicking the support bubble away.
//
// TOUCH HANDLING. The surface stays `touch-action: pan-y`, so a finger
// that MOVES scrolls the page like anywhere else — widgets cover most of
// the screen, and an unscrollable edit mode is unusable. The way a drag
// survives that: once the stationary hold has lifted the widget, every
// following touchmove is preventDefault-ed (non-passive listener), so the
// browser never gets to start the scroll whose pointercancel would kill
// the drag. Same pattern as dnd-kit's TouchSensor. NOT touch-action:none —
// that was tried, and it traded vertical drags for a page you couldn't
// scroll; and setting it after the hold is too late because the browser
// decides touch-action when the finger lands.

import { useCallback, useEffect, useRef, useState } from "react";

// Nearest ancestor that actually scrolls — the app shell scrolls a <main>,
// not the document, so window.scrollBy would do nothing.
function scrollParent(node) {
  let el = node?.parentElement;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

const HOLD_MS = 300;
const SLOP = 6;

export function useFreeMove({
  gridRef,
  gridCols,
  rowHeight = 80,
  gap = 12,
  span = { cols: 1, rows: 1 },
  pos = { x: 0, y: 0 },
  enabled = true,
  onCommit,
  onRemove,
  trashSelector = "[data-widget-trash]",
}) {
  const [drag, setDrag] = useState(null); // { dx, dy, target: {x,y}, overTrash }
  const state = useRef(null);

  const cleanup = useCallback(() => {
    const st = state.current;
    if (!st) return;
    if (st.raf) cancelAnimationFrame(st.raf);
    if (st.holdTimer) clearTimeout(st.holdTimer);
    window.removeEventListener("pointermove", st.onMove);
    window.removeEventListener("pointerup", st.onUp);
    window.removeEventListener("pointercancel", st.onCancel || st.onUp);
    if (st.onTouchMove) window.removeEventListener("touchmove", st.onTouchMove);
    state.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const onPointerDown = useCallback((e) => {
    if (!enabled || e.button === 1 || e.button === 2) return;
    // A second finger during a drag is almost always an accident.
    if (state.current) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const node = e.currentTarget;

    const onMove = (ev) => {
      const st = state.current;
      if (!st) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!st.active) {
        // Moved before the hold completed — that's a scroll, not a lift.
        if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) cleanup();
        return;
      }
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      const colPitch = (rect.width + gap) / gridCols;
      const rowPitch = rowHeight + gap;
      const cols = Math.min(span.cols || 1, gridCols);
      const x = Math.max(0, Math.min(gridCols - cols, Math.round(pos.x + dx / colPitch)));
      const y = Math.max(0, Math.round(pos.y + dy / rowPitch));
      const trash = trashSelector ? document.querySelector(trashSelector) : null;
      const tRect = trash?.getBoundingClientRect();
      const overTrash = !!tRect
        && ev.clientX >= tRect.left && ev.clientX <= tRect.right
        && ev.clientY >= tRect.top && ev.clientY <= tRect.bottom;
      st.pointerY = ev.clientY;
      setDrag({ dx, dy, target: { x, y }, overTrash });
      ev.preventDefault();
    };

    const onUp = () => {
      const st = state.current;
      const snapshot = st?.active ? st.last : null;
      cleanup();
      setDrag(null);
      if (!snapshot) return;
      if (snapshot.overTrash) onRemove?.();
      else if (snapshot.target.x !== pos.x || snapshot.target.y !== pos.y) onCommit?.(snapshot.target);
    };

    // A cancel is the browser taking the gesture away (a scroll winning, a
    // call arriving) — drop it, don't treat it as a drop.
    const onCancelEvent = () => { cleanup(); setDrag(null); };

    // Non-passive: once the widget is lifted this is what stops the page
    // from scrolling out from under the drag. Before the lift it does
    // nothing, so scroll gestures behave normally.
    const onTouchMove = (ev) => {
      const st = state.current;
      if (st?.active) ev.preventDefault();
    };

    state.current = { active: false, node, onMove, onUp, onCancel: onCancelEvent, onTouchMove, last: null, holdTimer: null };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancelEvent);
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    state.current.holdTimer = setTimeout(() => {
      const st = state.current;
      if (!st) return;
      st.active = true;
      st.pointerY = startY;
      try { node.setPointerCapture?.(e.pointerId); } catch { /* not supported */ }
      try { navigator.vibrate?.(10); } catch { /* no haptics */ }
      setDrag({ dx: 0, dy: 0, target: { x: pos.x, y: pos.y }, overTrash: false });

      // Dragging toward an edge scrolls the page, so a widget can be moved
      // somewhere that isn't currently on screen.
      const scroller = scrollParent(node);
      const EDGE = 72;
      const step = () => {
        const cur = state.current;
        if (!cur || !cur.active) return;
        const y = cur.pointerY;
        if (typeof y === "number") {
          const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
          const bottom = scroller === document.scrollingElement
            ? window.innerHeight
            : scroller.getBoundingClientRect().bottom;
          if (y < top + EDGE) scroller.scrollTop -= Math.ceil((top + EDGE - y) / 6);
          else if (y > bottom - EDGE) scroller.scrollTop += Math.ceil((y - (bottom - EDGE)) / 6);
        }
        cur.raf = requestAnimationFrame(step);
      };
      st.raf = requestAnimationFrame(step);
    }, HOLD_MS);
  }, [enabled, cleanup, gridRef, gridCols, gap, rowHeight, span.cols, pos.x, pos.y, onCommit, onRemove, trashSelector]);

  // Keep the latest preview where pointerup can read it without a stale closure.
  useEffect(() => { if (state.current) state.current.last = drag; }, [drag]);

  return {
    dragging: !!drag,
    drag,
    getMoveProps: () => (enabled
      ? { onPointerDown, style: { touchAction: "pan-y" } }
      : {}),
  };
}
