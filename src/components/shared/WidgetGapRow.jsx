// "Space between widgets" (v0.328.0) — one slider row, used by Display
// options → Shape on a board (a board's grid.gap, v0.340.3) and Profile
// style → Shape (a profile's PS.WIDGET_GAP). The write waits until the drag settles, so dragging
// doesn't save once per step. `value` undefined = the board's own spacing
// (`fallback`), shown greyed with the × hidden.
import React, { useEffect, useRef, useState } from "react";
import { SliderRow } from "@/components/shared/SettingRows";
import { WIDGET_GAP_MAX } from "@/lib/experimentalHome";

// The board canvas hands Display options the board it was opened on:
// { value, fallback, onChange } for that board's grid.gap. Null when
// Display options isn't open on a home board (a page elsewhere, or a
// profile, whose spacing is Profile style's) — then there's no row.
export const BoardGapContext = React.createContext(null);
export const useBoardGap = () => React.useContext(BoardGapContext);

export default function WidgetGapRow({ value, fallback, onChange, hint = "The gap between the widgets on this board." }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const pendingRef = useRef(value);
  // Follow outside changes (undo, another device) unless a write is pending.
  useEffect(() => { if (!timer.current) setDraft(value); }, [value]);
  // Leaving mid-drag (closing the sheet, the app going away) still saves
  // the last value.
  useEffect(() => {
    const flush = () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      latest.current(pendingRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, []);
  const change = (v) => {
    const next = Math.max(0, Math.min(WIDGET_GAP_MAX, Math.round(v)));
    setDraft(next);
    pendingRef.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; latest.current(next); }, 400);
  };
  const clear = () => {
    clearTimeout(timer.current);
    timer.current = null;
    setDraft(undefined);
    onChange(undefined);
  };
  return (
    <SliderRow label="Space between widgets" hint={hint}
      value={draft} fallback={fallback} min={0} max={WIDGET_GAP_MAX} step={2} unit="px"
      onChange={change} onClear={clear} />
  );
}
