// Which kit sheets are open right now, so the toast can keep clear of them
// (kit gate item 3). Sheet and SafetySheet register their box while open
// (not story-sheet inline ones); useOpenSheetTop() gives the top edge of
// the highest one, in px from the viewport's top, or null when none is open.

import { useEffect, useLayoutEffect, useState } from "react";

const boxes = new Set();
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };

export function useRegisterSheet(open, boxRef) {
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!open || !el) return undefined;
    boxes.add(el);
    emit();
    return () => { boxes.delete(el); emit(); };
  }, [open, boxRef]);
}

function topOf() {
  let top = null;
  for (const el of boxes) {
    if (!el.isConnected) continue;
    const t = el.getBoundingClientRect().top;
    if (top == null || t < top) top = t;
  }
  return top;
}

export function useOpenSheetTop() {
  const [top, setTop] = useState(null);
  useEffect(() => {
    let ro = null;
    const measure = () => setTop(topOf());
    const rewatch = () => {
      ro?.disconnect();
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(measure);
        for (const el of boxes) ro.observe(el);
      }
      measure();
    };
    listeners.add(rewatch);
    window.addEventListener("resize", measure);
    // A sheet's height animates when it grows; re-read when that ends.
    document.addEventListener("transitionend", measure, true);
    rewatch();
    return () => {
      listeners.delete(rewatch);
      window.removeEventListener("resize", measure);
      document.removeEventListener("transitionend", measure, true);
      ro?.disconnect();
    };
  }, []);
  return top;
}
