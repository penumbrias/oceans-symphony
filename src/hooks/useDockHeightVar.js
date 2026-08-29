import { useLayoutEffect } from "react";

// Publishes how much of the viewport's bottom a keyboard-docked toolbar is
// occluding as --os-kb-dock-pad on <html>. index.css adds it to the body's
// bottom padding so the page can always be scrolled fully clear of the dock
// — without it, whatever sat behind the dock was simply unreachable.
//
// Measured from the dock's actual rect (viewport height minus its top edge)
// rather than height + keyboard inset, so it stays right wherever the dock
// is parked — above the keyboard, or above the bottom chrome once the
// keyboard closes with the editor still focused.
//
// One dock at a time by design (one focused editor); the last unmount
// clears the var.
export default function useDockHeightVar(ref, active) {
  useLayoutEffect(() => {
    if (!active) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const set = () => {
      const r = el.getBoundingClientRect();
      const pad = Math.max(0, Math.ceil(window.innerHeight - r.top));
      document.documentElement.style.setProperty("--os-kb-dock-pad", `${pad}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    // Position changes (keyboard opening/closing) move the dock without
    // resizing it — the observer alone would miss them.
    const vv = window.visualViewport;
    window.addEventListener("resize", set);
    vv?.addEventListener("resize", set);
    vv?.addEventListener("scroll", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
      vv?.removeEventListener("resize", set);
      vv?.removeEventListener("scroll", set);
      document.documentElement.style.removeProperty("--os-kb-dock-pad");
    };
  }, [ref, active]);
}
