// The edge between a dock and the page: drag it, or focus it and use the
// arrow keys, to make the dock wider or narrower (taller or shorter for the
// bottom dock), always within the building code's limits (§4). Home and End
// jump to the smallest and largest; Enter puts back the default.
//
//   <DockResizer label="Side panel" side="right" value={20} min={18} max={28}
//     def={20} onChange={rem => …} onCommit={rem => …} />
//
// `onChange` follows the drag live (no write); `onCommit` runs ONCE when the
// drag or the key press ends, which is when the size is kept (one write per
// action, building code §1 rule 4).

import React, { useRef } from "react";
import "@/house/kit/frame/frameKit.css";

const remPx = () => {
  try { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; } catch { return 16; }
};

export default function DockResizer({ label, side = "right", value, min, max, def, step = 1, onChange, onCommit }) {
  const drag = useRef(null);
  const vertical = side === "bottom";
  const clamp = (v) => Math.round(Math.min(max, Math.max(min, v)) * 4) / 4;
  // Which way a pointer move grows the dock.
  const sign = side === "left" ? 1 : -1;

  const set = (v, commit) => {
    const n = clamp(v);
    onChange?.(n);
    if (commit) onCommit?.(n);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-label={`Resize ${label}`}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${Math.round(value * remPx())} pixels wide${value === def ? ", the default" : ""}`}
      title={`Drag to resize ${label}. Arrow keys work too.`}
      className="hk-resizer"
      data-side={side}
      onKeyDown={(e) => {
        const grow = vertical ? { ArrowUp: 1, ArrowDown: -1 } : side === "left" ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowLeft: 1, ArrowRight: -1 };
        if (grow[e.key]) { e.preventDefault(); set(value + grow[e.key] * step, true); }
        else if (e.key === "Home") { e.preventDefault(); set(min, true); }
        else if (e.key === "End") { e.preventDefault(); set(max, true); }
        else if (e.key === "Enter") { e.preventDefault(); set(def, true); }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { start: vertical ? e.clientY : e.clientX, from: value, last: value };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const delta = ((vertical ? e.clientY : e.clientX) - d.start) / remPx();
        d.last = clamp(d.from + (vertical ? -delta : sign * delta));
        onChange?.(d.last);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d && d.last !== d.from) onCommit?.(d.last);
      }}
      onPointerCancel={() => { const d = drag.current; drag.current = null; if (d) onChange?.(d.from); }}
    >
      <span className="hk-resizer-grip" aria-hidden="true" />
    </div>
  );
}

export { DockResizer };
