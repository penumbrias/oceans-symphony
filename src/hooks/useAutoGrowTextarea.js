import { useEffect, useLayoutEffect } from "react";

// A writing box that grows with what's written, up to a share of the
// screen, then scrolls. A fixed one- or three-line strip read as a thin
// sliver on a phone (owner reports on the bulletin post box, then on
// comments and replies). One copy so every bulletin box behaves the same.
//
// Sized on every value change, and again when the box's width changes
// (rotation, text size), the window height changes, or a web font
// finishes loading — otherwise the last lines could be cut off until
// the next keystroke.
function fit(el, min, maxScreen) {
  el.style.height = "auto";
  const cap = Math.round(window.innerHeight * maxScreen);
  el.style.height = `${Math.min(cap, Math.max(el.scrollHeight + 2, min))}px`;
  el.style.overflowY = el.scrollHeight + 2 > cap ? "auto" : "hidden";
}

export default function useAutoGrowTextarea(ref, value, { min = 128, maxScreen = 0.5 } = {}) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) fit(el, min, maxScreen);
  }, [ref, value, min, maxScreen]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0;
    const refit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (ref.current) fit(ref.current, min, maxScreen); });
    };
    let lastWidth = el.getBoundingClientRect().width;
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
          // Only width matters; our own height writes must not loop.
          const w = entries[0]?.contentRect?.width ?? lastWidth;
          if (Math.abs(w - lastWidth) > 0.5) { lastWidth = w; refit(); }
        })
      : null;
    ro?.observe(el);
    window.addEventListener("resize", refit);
    const fonts = typeof document !== "undefined" ? document.fonts : null;
    fonts?.addEventListener?.("loadingdone", refit);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", refit);
      fonts?.removeEventListener?.("loadingdone", refit);
    };
  }, [ref, min, maxScreen]);
}
