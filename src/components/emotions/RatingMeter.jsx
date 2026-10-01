// Vertical 0–5 rating meter — the Quick Check-In's side rating. Tap a
// segment to set it, drag along the stack to scrub, tap the lit top
// segment again to clear (null = nothing logged). Replaces a native
// vertical <input type="range">, which rendered differently on every
// platform and was hard to hit on a phone.

import React, { useRef } from "react";

const LEVELS = [5, 4, 3, 2, 1, 0];

export default function RatingMeter({ value = null, onChange, color = "#F59E0B", label = "Rating" }) {
  const stackRef = useRef(null);
  const dragging = useRef(false);
  const startValue = useRef(null);
  const moved = useRef(false);

  const valueAt = (clientY) => {
    const el = stackRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const frac = Math.min(0.999, Math.max(0, (clientY - r.top) / r.height));
    return LEVELS[Math.floor(frac * LEVELS.length)];
  };

  const onPointerDown = (e) => {
    if (typeof e.button === "number" && e.button !== 0) return;
    dragging.current = true;
    moved.current = false;
    startValue.current = value;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* synthetic or stale pointer */ }
    onChange(valueAt(e.clientY));
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const v = valueAt(e.clientY);
    if (v !== value) { moved.current = true; onChange(v); }
  };
  const onPointerUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    // A plain tap on the value that was already set clears it.
    if (!moved.current && startValue.current != null && valueAt(e.clientY) === startValue.current) onChange(null);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); onChange(Math.min(5, (value ?? -1) + 1)); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); onChange(Math.max(0, (value ?? 1) - 1)); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onChange(null); }
  };

  return (
    <div
      ref={stackRef}
      role="slider"
      tabIndex={0}
      aria-label={`${label}, 0 to 5`}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value == null ? "not set" : String(value)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragging.current = false; }}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-1 py-0.5 touch-none select-none cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {LEVELS.map((n) => {
        const lit = value != null && n <= value;
        const isZero = n === 0;
        return (
          <span
            key={n}
            aria-hidden
            className={`flex items-center justify-center rounded-md transition-colors text-[0.5625rem] font-semibold tabular-nums ${
              isZero ? "h-3.5 w-7" : "h-5 w-7"
            } ${lit ? "text-white" : "bg-muted/60 text-muted-foreground/60"}`}
            style={lit ? { backgroundColor: color } : undefined}
          >
            {n === value ? n : ""}
          </span>
        );
      })}
    </div>
  );
}
