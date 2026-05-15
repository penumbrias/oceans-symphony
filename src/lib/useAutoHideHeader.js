import { useEffect, useState, useRef } from "react";

// Returns a boolean that flips to `true` while the user is scrolling
// DOWN past a small threshold, and back to `false` when they scroll
// UP. Designed for the mobile sticky header at high accessibility
// font scales (150% / 175% / 200%) — at those sizes the header eats
// roughly 25%+ of the landscape viewport, which kills legibility for
// the people who set the larger font in the first place. Auto-hiding
// only activates at xl3 / xl4 / xl5 so users at normal sizes don't
// get unexpected motion they didn't ask for.
//
// Watches the scroll position of the nearest `.app-content-main`
// element (AppLayout's <main>), because that's the element that
// scrolls in this app — `window.scrollY` stays at 0.
//
// Listens to changes on the <html> class list so flipping font
// size in Settings → Accessibility takes effect without a reload.

const LARGE_FONT_CLASSES = new Set(["a11y-text-xl3", "a11y-text-xl4", "a11y-text-xl5"]);
const HIDE_DELTA_PX = 8;   // need at least this much scroll-down to hide
const SHOW_DELTA_PX = 8;   // and at least this much scroll-up to reveal
const TOP_GUARD_PX = 32;   // never hide if we're near the top

function htmlHasLargeFont() {
  if (typeof document === "undefined") return false;
  const cls = document.documentElement.classList;
  for (const c of LARGE_FONT_CLASSES) {
    if (cls.contains(c)) return true;
  }
  return false;
}

export default function useAutoHideHeader() {
  const [hidden, setHidden] = useState(false);
  const [enabled, setEnabled] = useState(htmlHasLargeFont);
  const lastYRef = useRef(0);

  // Re-check enabled when the user toggles font size — Accessibility
  // settings flip the className on <html> rather than re-rendering us,
  // so a MutationObserver is the cleanest hook in.
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const next = htmlHasLargeFont();
      setEnabled(prev => (prev !== next ? next : prev));
      if (!next) setHidden(false); // dropping back to normal size un-hides
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    const scroller = document.querySelector(".app-content-main");
    if (!scroller) return;

    lastYRef.current = scroller.scrollTop;
    const onScroll = () => {
      const y = scroller.scrollTop;
      const delta = y - lastYRef.current;
      if (y < TOP_GUARD_PX) {
        if (hidden) setHidden(false);
      } else if (delta > HIDE_DELTA_PX) {
        if (!hidden) setHidden(true);
      } else if (delta < -SHOW_DELTA_PX) {
        if (hidden) setHidden(false);
      }
      // Only update the reference when we move enough — otherwise
      // tiny jitter pollutes the baseline and the header flickers.
      if (Math.abs(delta) > HIDE_DELTA_PX) {
        lastYRef.current = y;
      }
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [enabled, hidden]);

  return hidden;
}
