import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { readPanicTapsSetting, DEFAULT_PANIC_TAPS } from "@/components/settings/GroceryPanicTapsSettings";

// Quick taps anywhere on the screen → open the Grocery List panel as
// a privacy cover. The panel sits over every other UI in the app so a
// glance reveals nothing about the system.
//
// "Quick" = N pointerdown events within WINDOW_MS, where each one is a
// real single-finger tap — NOT one of the fingers in a pinch / two-
// finger drag. The naive implementation just counted every pointerdown,
// which meant pinching to zoom (the Inner World map, the alters page,
// etc.) reliably triggered the privacy cover because the two fingers
// land as two pointerdown events within milliseconds.
//
// We track which pointer ids are currently down. As soon as more than
// one is down at the same time, the user is mid-gesture: we discard any
// pending tap state and stop counting further pointerdowns until every
// pointer has lifted. That way a pinch's second-finger landing actively
// CLEARS rather than ADDS to the tap count.
//
// Triggers in form/textarea/[contenteditable] elements are still ignored
// so the gesture doesn't fire while the user is typing.
//
// The tap count is user-configurable via Settings → Data & Privacy →
// Quick-tap privacy cover. Setting it to "off" disables the listener
// entirely so accidental gestures can't fire on accessibility-heavy
// touch devices.
const WINDOW_MS = 500;

export default function useTripleTapPanic() {
  const tapsRef = useRef([]);
  const activePointersRef = useRef(new Set());
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const tapsRequired = readPanicTapsSetting(settingsList?.[0]);

  useEffect(() => {
    if (tapsRequired === "off") return;
    const need = typeof tapsRequired === "number" ? tapsRequired : DEFAULT_PANIC_TAPS;

    const onPointerDown = (e) => {
      const t = e.target;
      if (t && (t.closest("input, textarea, [contenteditable=true]"))) return;

      // Track this pointer's lifetime. pointerId is unique per finger /
      // mouse button until the corresponding up/cancel event.
      activePointersRef.current.add(e.pointerId);

      // Multi-touch gesture in progress (pinch, two-finger pan, etc.) —
      // wipe any pending tap state and stop counting. A second finger
      // landing should ACTIVELY clear the count, not add to it.
      if (activePointersRef.current.size > 1) {
        tapsRef.current = [];
        return;
      }

      const now = Date.now();
      const taps = tapsRef.current.filter((ts) => now - ts < WINDOW_MS);
      taps.push(now);
      tapsRef.current = taps;
      if (taps.length >= need) {
        tapsRef.current = [];
        // source: "panic" lets the panel show its first-time "What's this?"
        // explainer only when opened via the gesture (not the nav button).
        window.dispatchEvent(new CustomEvent("open-grocery-list", { detail: { source: "panic" } }));
      }
    };

    const onPointerEnd = (e) => {
      activePointersRef.current.delete(e.pointerId);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
    };
  }, [tapsRequired]);
}
