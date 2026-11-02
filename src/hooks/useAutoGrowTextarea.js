import { useLayoutEffect } from "react";

// A writing box that grows with what's written, up to a share of the
// screen, then scrolls. A fixed one- or three-line strip read as a thin
// sliver on a phone (owner reports on the bulletin post box, then on
// comments and replies). One copy so every bulletin box behaves the same.
export default function useAutoGrowTextarea(ref, value, { min = 128, maxScreen = 0.5 } = {}) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = Math.round(window.innerHeight * maxScreen);
    el.style.height = `${Math.min(cap, Math.max(el.scrollHeight + 2, min))}px`;
    el.style.overflowY = el.scrollHeight + 2 > cap ? "auto" : "hidden";
  }, [ref, value, min, maxScreen]);
}
