import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { queryClientInstance } from "@/lib/query-client";

// App-wide pull-to-refresh (touch devices only), mounted ONCE in AppLayout so
// the v2 home board and every page get it without per-page wiring. The old
// PullToRefresh.jsx wrapper assumed it WAS the scroll container; the app
// scrolls the body, so this one listens at the window and never wraps or
// translates content — it only shows an indicator and refetches.
//
// Refresh = invalidate + refetch every active query. The "server" is the
// local DB, so this mainly matters for cross-device peace of mind, the
// friends poll, and any surface whose 30s staleTime is showing its age —
// and it gives the "did that save?" instinct somewhere safe to go.
//
// Guards (never fight another gesture):
//   - only starts with the WINDOW at its top;
//   - never inside dialogs/sheets, editors, inputs, or [data-own-hold]
//     surfaces (planner drags, level rails);
//   - never while the home board is in edit mode (widget drags);
//   - cancels unless the pull is decisively vertical;
//   - ignores touches inside any scrolled (or scrollable-and-not-at-top)
//     inner container.
const THRESHOLD = 72;

export default function GlobalPullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef(null); // { x, y }
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    if (!touch) return undefined;

    const blockedAncestor = (target) => {
      let el = target instanceof Element ? target : null;
      if (el?.closest?.('[role="dialog"], [data-vaul-drawer], [data-own-hold], input, textarea, [contenteditable="true"]')) return true;
      while (el && el !== document.body) {
        const st = getComputedStyle(el);
        if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.scrollTop > 0) return true;
        if (st.position === "fixed") return true; // overlays own their gestures
        el = el.parentElement;
      }
      return false;
    };

    const onStart = (e) => {
      if (refreshingRef.current) return;
      if (window.scrollY > 2) return;
      if (document.documentElement.hasAttribute("data-home-edit")) return;
      if (blockedAncestor(e.target)) return;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    };

    const onMove = (e) => {
      if (!start.current || refreshingRef.current) return;
      const t = e.touches[0];
      const dy = t.clientY - start.current.y;
      const dx = Math.abs(t.clientX - start.current.x);
      // A sideways or upward move is a swipe/scroll — stand down.
      if (dy < -4 || (dx > 24 && dx > dy)) { start.current = null; setPull(0); pullRef.current = 0; return; }
      if (window.scrollY > 2) { start.current = null; setPull(0); pullRef.current = 0; return; }
      if (dy > 0) {
        const p = Math.min(THRESHOLD * 1.4, dy * 0.45);
        pullRef.current = p;
        setPull(p);
      }
    };

    const onEnd = async () => {
      if (!start.current) return;
      start.current = null;
      if (pullRef.current >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(THRESHOLD);
        pullRef.current = THRESHOLD;
        try { navigator.vibrate?.(10); } catch { /* no haptics */ }
        try {
          window.dispatchEvent(new CustomEvent("symphony-pull-refresh"));
          await queryClientInstance.refetchQueries({ type: "active" });
        } catch { /* refetch errors surface per-query */ }
        refreshingRef.current = false;
        setRefreshing(false);
      }
      pullRef.current = 0;
      setPull(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const shown = refreshing ? THRESHOLD : pull;
  if (shown <= 0) return null;
  const progress = Math.min(shown / THRESHOLD, 1);

  return (
    <div
      className="fixed left-0 right-0 z-[90] flex justify-center pointer-events-none"
      style={{ top: `calc(min(env(safe-area-inset-top, 0px), 64px) + 56px + ${Math.round(progress * 14)}px)`, opacity: progress }}
      aria-hidden="true"
    >
      <div
        className="w-8 h-8 rounded-full bg-background border border-border shadow-md flex items-center justify-center"
        style={{ transform: `rotate(${progress * 270}deg)` }}
      >
        <Loader2 className={`w-4 h-4 ${refreshing ? "text-primary animate-spin" : "text-muted-foreground"}`} />
      </div>
    </div>
  );
}
