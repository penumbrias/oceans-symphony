// Edge-resize for experimental-homescreen widgets.
//
// Interaction (owner-specified): press and hold a widget's edge handle for
// 0.15s WITHOUT moving (>6px of movement during the hold means the touch was
// a scroll/flick and cancels), then drag — horizontal drags snap the widget's
// column span to the grid's column pitch, vertical drags snap its row span
// to the 80px row unit. The handles live OUTSIDE the element that carries
// dnd-kit's drag listeners (they're siblings), so move-drag and resize-drag
// never fight; pointer capture keeps the resize tracking even when the
// finger leaves the narrow handle.
//
// Preview is applied by the CALLER straight onto gridColumn/minHeight —
// never via transforms (see the scale-strip note in ExperimentalDashboard's
// SortableWidget: transforms are already fragile with mixed spans under
// rectSortingStrategy).

import { useRef, useState, useCallback } from "react";

const HOLD_MS = 150;
const SLOP_PX = 6;
const ROW_PX = 80;

export function useEdgeResize({ gridRef, gridCols, span, min, max, onCommit }) {
  const [preview, setPreview] = useState(null); // {cols, rows} | null
  const [active, setActive] = useState(false);
  const stateRef = useRef(null); // { pointerId, axis, phase, startX, startY, startSpan, pitch, timer }

  const clear = useCallback(() => {
    const s = stateRef.current;
    if (s?.timer) clearTimeout(s.timer);
    stateRef.current = null;
    setPreview(null);
    setActive(false);
  }, []);

  const onPointerDown = useCallback((e, axis) => {
    if (stateRef.current) return; // ignore a second simultaneous pointer
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* synthetic/stale pointer — tracking still works via bubbling */ }
    const s = {
      pointerId: e.pointerId,
      axis,
      phase: "pending",
      startX: e.clientX,
      startY: e.clientY,
      startSpan: { ...span },
      pitch: 0,
      timer: null,
    };
    s.timer = setTimeout(() => {
      if (stateRef.current !== s) return;
      s.phase = "active";
      const el = gridRef?.current;
      const rect = el?.getBoundingClientRect();
      const gap = el ? parseFloat(getComputedStyle(el).columnGap) || 0 : 0;
      s.pitch = rect ? (rect.width + gap) / Math.max(1, gridCols) : 100;
      setActive(true);
      setPreview({ ...s.startSpan });
      if (navigator.vibrate) navigator.vibrate(10);
    }, HOLD_MS);
    stateRef.current = s;
  }, [gridRef, gridCols, span]);

  const onPointerMove = useCallback((e) => {
    const s = stateRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (s.phase === "pending") {
      // Moved during the hold — it was a scroll/flick, not a resize.
      if (dx * dx + dy * dy > SLOP_PX * SLOP_PX) clear();
      return;
    }
    e.preventDefault();
    const clampC = (v) => Math.max(min?.cols ?? 1, Math.min(Math.min(max?.cols ?? 12, gridCols), v));
    const clampR = (v) => Math.max(min?.rows ?? 1, Math.min(max?.rows ?? 8, v));
    setPreview({
      cols: s.axis.includes("x") ? clampC(s.startSpan.cols + Math.round(dx / s.pitch)) : s.startSpan.cols,
      rows: s.axis.includes("y") ? clampR(s.startSpan.rows + Math.round(dy / ROW_PX)) : s.startSpan.rows,
    });
  }, [gridCols, min, max, clear]);

  const onPointerEnd = useCallback((e) => {
    const s = stateRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    if (s.phase === "active" && stateRef.current) {
      setPreview((p) => {
        if (p && (p.cols !== s.startSpan.cols || p.rows !== s.startSpan.rows)) onCommit(p);
        return null;
      });
    }
    clear();
  }, [onCommit, clear]);

  const getHandleProps = useCallback((axis) => ({
    onPointerDown: (e) => onPointerDown(e, axis),
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onContextMenu: (e) => e.preventDefault(),
    style: { touchAction: "none" },
  }), [onPointerDown, onPointerMove, onPointerEnd]);

  return { getHandleProps, preview, active };
}
