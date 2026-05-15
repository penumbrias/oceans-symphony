import { useEffect, useState, useRef } from "react";

// Returns a boolean that flips to `true` while the user is scrolling
// DOWN past a small threshold in LANDSCAPE orientation, and back to
// `false` when they scroll UP. In portrait it's always false — the
// header never moves.
//
// Why landscape-only: on a phone in landscape the viewport is only
// ~360 CSS px tall and the header chrome eats ~20% of that, so
// reclaiming it during scroll is a real legibility win. In portrait
// the header is small relative to the viewport and users expect it
// to stay put (they kept asking — version 0.15.2 hid it at large
// font sizes regardless of orientation and that felt wrong).
//
// Orientation detection: a previous version used
// `matchMedia('(orientation: landscape)')` which Capacitor's Android
// WebView was reporting wrong in some cases — users in portrait saw
// the header disappear on scroll. Switched to a direct
// innerWidth/innerHeight comparison which is rock-solid in every
// browser engine (and refreshes via resize events, which DO fire
// reliably on rotation in Capacitor).

const HIDE_DELTA_PX = 8;   // need at least this much scroll-down to hide
const SHOW_DELTA_PX = 8;   // and at least this much scroll-up to reveal
const TOP_GUARD_PX = 32;   // never hide if we're near the top

function detectLandscape() {
  if (typeof window === "undefined") return false;
  return window.innerWidth > window.innerHeight;
}

export default function useAutoHideHeader() {
  const [hidden, setHidden] = useState(false);
  const [landscape, setLandscape] = useState(detectLandscape);
  const lastYRef = useRef(0);

  // Track orientation via resize events. Capacitor fires these on
  // rotation; web browsers fire on window resize. matchMedia is
  // deliberately NOT used here — see comment at the top.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => {
      const next = detectLandscape();
      setLandscape(prev => (prev === next ? prev : next));
      if (!next) setHidden(false);
    };
    refresh();
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
    };
  }, []);

  useEffect(() => {
    if (!landscape) {
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
  }, [landscape, hidden]);

  return hidden;
}
