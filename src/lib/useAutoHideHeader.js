import { useEffect, useState, useRef } from "react";

// Returns a boolean that flips to `true` while the user is scrolling
// DOWN past a small threshold, and back to `false` when they scroll
// UP. Wired into the mobile sticky header.
//
// Activation rule: landscape orientation ONLY. In landscape on a
// phone the viewport is only ~360 CSS px tall and the header chrome
// eats ~20% of that — the auto-hide claws back that vertical space
// while scrolling content. Portrait keeps a fixed header so it never
// disappears on the user mid-tap, which is what they asked for.
//
// Watches the scroll position of the nearest `.app-content-main`
// element (AppLayout's <main>) — the scroll happens there, not on
// window in this app.

const HIDE_DELTA_PX = 8;   // need at least this much scroll-down to hide
const SHOW_DELTA_PX = 8;   // and at least this much scroll-up to reveal
const TOP_GUARD_PX = 32;   // never hide if we're near the top

function isLandscape() {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(orientation: landscape)").matches;
  } catch {
    // Fallback for environments where matchMedia is missing.
    return window.innerWidth > window.innerHeight;
  }
}

export default function useAutoHideHeader() {
  const [hidden, setHidden] = useState(false);
  const [landscape, setLandscape] = useState(isLandscape);
  const lastYRef = useRef(0);

  // Listen for orientation changes — flipping the phone should
  // enable / disable auto-hide without a reload. Use matchMedia's
  // change event rather than the deprecated orientationchange.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(orientation: landscape)");
    const onChange = (e) => {
      setLandscape(e.matches);
      if (!e.matches) setHidden(false); // rotating to portrait re-reveals
    };
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    // Safari < 14 fallback
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
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
