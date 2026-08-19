// Resizable "Peek" for the options sheets (v0.193.2). One hook + one grab
// bar, used by the widget-options sheet and Display options so both
// behave the same: drag the bar up/down to set the peek height (15–90vh),
// remembered per device. The bar stops vaul's own drag-to-dismiss from
// seeing the gesture — with both listening, a drag either dismissed the
// sheet or fought the resize.
import React, { useRef, useState } from "react";

export function usePeekHeight(storageKey, fallback = 40) {
  const [peekH, setPeekH] = useState(() => {
    try { const n = Number(localStorage.getItem(storageKey)); return Number.isFinite(n) && n > 0 ? n : fallback; } catch { return fallback; }
  });
  const drag = useRef(null);
  const latest = useRef(peekH);
  latest.current = peekH;
  const start = (e, dock) => {
    drag.current = { y: e.clientY, h: latest.current, dock };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    // Bottom dock: dragging UP grows the sheet; top dock: dragging DOWN does.
    const dy = (d.dock === "top" ? 1 : -1) * (e.clientY - d.y);
    const next = Math.max(15, Math.min(90, d.h + (dy / window.innerHeight) * 100));
    latest.current = next;
    setPeekH(next);
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    try { localStorage.setItem(storageKey, String(Math.round(latest.current))); } catch { /* storage off */ }
  };
  return { peekH, start, move, end };
}

export function PeekHandle({ resize, dock = "bottom" }) {
  return (
    <div role="separator" aria-label="Drag to resize" aria-orientation="horizontal" data-vaul-no-drag
      onPointerDown={(e) => { e.stopPropagation(); resize.start(e, dock); }}
      onPointerMove={(e) => { e.stopPropagation(); resize.move(e); }}
      onPointerUp={(e) => { e.stopPropagation(); resize.end(e); }}
      onPointerCancel={(e) => { e.stopPropagation(); resize.end(e); }}
      // A generous target: thin bars are hard to hit mid-scroll on glass.
      className={`w-full flex flex-col items-center justify-center cursor-ns-resize select-none flex-shrink-0 ${dock === "top" ? "order-last pb-3 pt-2" : "pt-3 pb-2"}`}
      style={{ touchAction: "none", minHeight: 28 }}>
      {/* No label (house rule — the aria-label carries it for screen
          readers; visually the pill is the affordance). */}
      <span className="h-2 w-[100px] rounded-full bg-muted" />
    </div>
  );
}
