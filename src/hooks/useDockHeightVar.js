import { useLayoutEffect } from "react";

// Publishes how much of the viewport's bottom a keyboard-docked toolbar is
// occluding (the dock's own height PLUS the keyboard band it floats above)
// as --os-kb-dock-pad on <html>. index.css adds it to the body's bottom
// padding so the page can always be scrolled fully clear of the dock —
// without it, whatever sat behind the dock was simply unreachable.
//
// One dock at a time by design (one focused editor); the last unmount
// clears the var.
export default function useDockHeightVar(ref, active, kbBottom = 0) {
  useLayoutEffect(() => {
    if (!active) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const set = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty("--os-kb-dock-pad", `${Math.ceil(h + kbBottom)}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--os-kb-dock-pad");
    };
  }, [ref, active, kbBottom]);
}
