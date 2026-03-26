import React, { useState, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";

/**
 * Wraps children with a pull-to-refresh gesture (mobile only).
 * On desktop the children render normally without any wrapper behaviour.
 * 
 * Usage:
 *   <PullToRefresh onRefresh={async () => { await refetch(); }}>
 *     <YourList />
 *   </PullToRefresh>
 */
export default function PullToRefresh({ onRefresh, children, className = "" }) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const THRESHOLD = 72;

  const onTouchStart = useCallback((e) => {
    // Only start if we're at the top of the scroll container
    const el = e.currentTarget;
    if (el.scrollTop > 2) return;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      // Logarithmic resistance so it doesn't fly off screen
      setPullY(Math.min(THRESHOLD * 1.4, delta * 0.45));
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (startY.current === null) return;
    startY.current = null;
    if (pullY >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(THRESHOLD);
      try { await onRefresh(); } finally {
        setRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  }, [pullY, refreshing, onRefresh, THRESHOLD]);

  const progress = Math.min(pullY / THRESHOLD, 1);

  return (
    <div
      className={`relative overflow-y-auto overscroll-none ${className}`}
      style={{ touchAction: pullY > 0 ? "none" : "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator — only visible while pulling or refreshing */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center z-10 pointer-events-none transition-all duration-200"
        style={{
          height: `${Math.max(pullY, refreshing ? THRESHOLD : 0)}px`,
          opacity: progress,
        }}
      >
        <div
          className="w-8 h-8 rounded-full bg-background border border-border shadow-md flex items-center justify-center"
          style={{ transform: `rotate(${progress * 270}deg)` }}
        >
          {refreshing
            ? <Loader2 className="w-4 h-4 text-primary animate-spin" />
            : <Loader2 className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </div>

      {/* Content shifted down while pulling */}
      <div style={{ transform: `translateY(${Math.max(pullY, refreshing ? THRESHOLD : 0)}px)`, transition: refreshing || pullY === 0 ? "transform 0.25s ease" : "none" }}>
        {children}
      </div>
    </div>
  );
}