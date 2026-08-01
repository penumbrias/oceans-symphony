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

import { useCallback, useEffect, useRef, useState } from "react";

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
    if (st.holdTimer) clearTimeout(st.holdTimer);
    window.removeEventListener("pointermove", st.onMove);
    window.removeEventListener("pointerup", st.onUp);
    window.removeEventListener("pointercancel", st.onUp);
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

    state.current = { active: false, onMove, onUp, last: null, holdTimer: null };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    state.current.holdTimer = setTimeout(() => {
      const st = state.current;
      if (!st) return;
      st.active = true;
      try { node.setPointerCapture?.(e.pointerId); } catch { /* not supported */ }
      try { navigator.vibrate?.(10); } catch { /* no haptics */ }
      setDrag({ dx: 0, dy: 0, target: { x: pos.x, y: pos.y }, overTrash: false });
    }, HOLD_MS);
  }, [enabled, cleanup, gridRef, gridCols, gap, rowHeight, span.cols, pos.x, pos.y, onCommit, onRemove, trashSelector]);

  // Keep the latest preview where pointerup can read it without a stale closure.
  useEffect(() => { if (state.current) state.current.last = drag; }, [drag]);

  return {
    dragging: !!drag,
    drag,
    getMoveProps: () => (enabled ? { onPointerDown, style: { touchAction: "pan-y" } } : {}),
  };
}
