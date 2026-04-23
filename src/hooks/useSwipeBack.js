import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const EDGE_THRESHOLD = 40;   // px from left edge to begin tracking
const MIN_SWIPE_X = 60;      // minimum horizontal distance to trigger
const INDICATOR_FADE_MS = 400;

/**
 * Returns true if the element or any ancestor blocks swipe-back.
 * Blocks on: data-no-swipe-back, .swipe-ignore, SVG elements,
 * or horizontally scrollable containers.
 */
function shouldIgnoreTarget(target) {
  let el = target;
  while (el && el !== document.body) {
    // Explicit opt-out attributes / classes
    if (el.dataset?.noSwipeBack !== undefined) return true;
    if (el.classList?.contains("swipe-ignore")) return true;
    // SVG elements
    if (el instanceof SVGElement) return true;
    // Horizontally scrollable containers
    if (el.scrollWidth > el.clientWidth) {
      const style = window.getComputedStyle(el);
      const overflow = style.overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

export default function useSwipeBack() {
  const navigate = useNavigate();
  const touchStart = useRef(null);
  const [indicatorProgress, setIndicatorProgress] = useState(0); // 0–1
  const [indicatorVisible, setIndicatorVisible] = useState(false);
  const fadeTimer = useRef(null);

  useEffect(() => {
    const onTouchStart = (e) => {
      const touch = e.touches[0];
      // Only track touches starting in the left edge zone
      if (touch.clientX > EDGE_THRESHOLD) {
        touchStart.current = null;
        return;
      }
      if (shouldIgnoreTarget(e.target)) {
        touchStart.current = null;
        return;
      }
      touchStart.current = { x: touch.clientX, y: touch.clientY };
      setIndicatorVisible(false);
      setIndicatorProgress(0);
    };

    const onTouchMove = (e) => {
      if (!touchStart.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = Math.abs(touch.clientY - touchStart.current.y);
      // Must be more horizontal than vertical
      if (dx <= 0 || dy > dx) return;
      const progress = Math.min(dx / MIN_SWIPE_X, 1);
      setIndicatorProgress(progress);
      setIndicatorVisible(true);
    };

    const onTouchEnd = (e) => {
      if (!touchStart.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = Math.abs(touch.clientY - touchStart.current.y);
      touchStart.current = null;

      // Fade out indicator
      clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => {
        setIndicatorVisible(false);
        setIndicatorProgress(0);
      }, INDICATOR_FADE_MS);

      // Check all gesture conditions
      if (dx < MIN_SWIPE_X) return;
      if (dy >= dx) return; // more vertical than horizontal
      if ((window.history.state?.idx ?? 0) <= 0) return; // no history
      navigate(-1);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      clearTimeout(fadeTimer.current);
    };
  }, [navigate]);

  return { indicatorVisible, indicatorProgress };
}