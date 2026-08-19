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
  const start = (e, dock) => {
    drag.current = { y: e.clientY, h: peekH, dock };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    // Bottom dock: dragging UP grows the sheet; top dock: dragging DOWN does.
    const dy = (d.dock === "top" ? 1 : -1) * (e.clientY - d.y);
    setPeekH(Math.max(15, Math.min(90, d.h + (dy / window.innerHeight) * 100)));
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setPeekH((h) => { try { localStorage.setItem(storageKey, String(Math.round(h))); } catch { /* storage off */ } return h; });
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
      className={`w-full flex flex-col items-center justify-center cursor-ns-resize select-none ${dock === "top" ? "order-last pb-2 pt-1" : "pt-3 pb-1"}`}
      style={{ touchAction: "none" }}>
      <span className="h-2 w-[100px] rounded-full bg-muted" />
      <span className="text-[0.625rem] text-muted-foreground mt-0.5">drag to resize</span>
    </div>
  );
}
