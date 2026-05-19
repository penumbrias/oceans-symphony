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
    const hideIndicatorSoon = () => {
      clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => {
        setIndicatorVisible(false);
        setIndicatorProgress(0);
      }, INDICATOR_FADE_MS);
    };

    const onTouchStart = (e) => {
      // If a gesture is already in progress, ignore additional touches.
      // Without this guard, a second finger landing anywhere outside the
      // 40px edge zone would null out touchStart.current — and then the
      // matching touchend would early-return, never scheduling the
      // fade-out. The result was a back-chevron stuck on screen until
      // the user happened to start another edge-swipe.
      if (touchStart.current) return;
      const touch = e.touches[0];
      // Only track touches starting in the left edge zone
      if (touch.clientX > EDGE_THRESHOLD) return;
      if (shouldIgnoreTarget(e.target)) return;
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
      // Always schedule the fade-out, even when touchStart.current is
      // null. If the indicator somehow became visible without us holding
      // an active gesture (e.g. mid-flight state got cleared by another
      // listener), this guarantees it still disappears.
      hideIndicatorSoon();

      if (!touchStart.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = Math.abs(touch.clientY - touchStart.current.y);
      touchStart.current = null;

      // Check all gesture conditions
      if (dx < MIN_SWIPE_X) return;
      if (dy >= dx) return; // more vertical than horizontal
      if ((window.history.state?.idx ?? 0) <= 0) return; // no history
      navigate(-1);
    };

    // Cancellation path: if iOS interrupts the gesture (incoming call,
    // system swipe, app switcher, etc.) touchend never fires. Without this,
    // the indicator stays painted on screen until the next touchstart.
    const onTouchCancel = () => {
      touchStart.current = null;
      clearTimeout(fadeTimer.current);
      setIndicatorVisible(false);
      setIndicatorProgress(0);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      clearTimeout(fadeTimer.current);
    };
  }, [navigate]);

  return { indicatorVisible, indicatorProgress };
}