import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { readPanicTapsSetting, DEFAULT_PANIC_TAPS } from "@/components/settings/GroceryPanicTapsSettings";

// Quick taps anywhere on the screen → open the Grocery List panel as
// a privacy cover. The panel sits over every other UI in the app so a
// glance reveals nothing about the system.
//
// "Quick" = N pointerdown events within WINDOW_MS. We deliberately
// look at pointerdown (not click) so the gesture works mid-scroll, mid-
// long-press, and even on form fields, with no need to defeat
// stopPropagation in child components.
//
// Triggers in form/textarea/[contenteditable] elements are ignored so the
// gesture doesn't fire while the user is typing in a private note.
//
// The tap count is user-configurable via Settings → Data & Privacy →
// Quick-tap privacy cover. Setting it to "off" disables the listener
// entirely so accidental gestures can't fire on accessibility-heavy
// touch devices.
const WINDOW_MS = 500;

export default function useTripleTapPanic() {
  const tapsRef = useRef([]);
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const tapsRequired = readPanicTapsSetting(settingsList?.[0]);

  useEffect(() => {
    if (tapsRequired === "off") return;
    const need = typeof tapsRequired === "number" ? tapsRequired : DEFAULT_PANIC_TAPS;
    const onTap = (e) => {
      const t = e.target;
      if (t && (t.closest("input, textarea, [contenteditable=true]"))) return;
      const now = Date.now();
      const taps = tapsRef.current.filter((ts) => now - ts < WINDOW_MS);
      taps.push(now);
      tapsRef.current = taps;
      if (taps.length >= need) {
        tapsRef.current = [];
        window.dispatchEvent(new CustomEvent("open-grocery-list"));
      }
    };
    window.addEventListener("pointerdown", onTap, true);
    return () => window.removeEventListener("pointerdown", onTap, true);
  }, [tapsRequired]);
}
