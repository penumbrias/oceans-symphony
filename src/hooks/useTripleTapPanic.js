import { useEffect, useRef } from "react";

// Three quick taps anywhere on the screen → open the Grocery List panel as
// a privacy cover. The panel sits over every other UI in the app so a
// glance reveals nothing about the system.
//
// "Quick" = three pointerdown events within 700 ms total. We deliberately
// look at pointerdown (not click) so the gesture works mid-scroll, mid-
// long-press, and even on form fields, with no need to defeat
// stopPropagation in child components.
//
// Triggers in form/textarea/[contenteditable] elements are ignored so the
// gesture doesn't fire while the user is typing in a private note.
const WINDOW_MS = 700;
const TAPS_NEEDED = 3;

export default function useTripleTapPanic() {
  const tapsRef = useRef([]);
  useEffect(() => {
    const onTap = (e) => {
      const t = e.target;
      if (t && (t.closest("input, textarea, [contenteditable=true]"))) return;
      const now = Date.now();
      const taps = tapsRef.current.filter((ts) => now - ts < WINDOW_MS);
      taps.push(now);
      tapsRef.current = taps;
      if (taps.length >= TAPS_NEEDED) {
        tapsRef.current = [];
        window.dispatchEvent(new CustomEvent("open-grocery-list"));
      }
    };
    window.addEventListener("pointerdown", onTap, true);
    return () => window.removeEventListener("pointerdown", onTap, true);
  }, []);
}
