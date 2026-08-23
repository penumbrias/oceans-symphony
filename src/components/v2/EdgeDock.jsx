import React, { useEffect, useRef, useState } from "react";

// ── Edge dock (shared) ─────────────────────────────────────────────
// The positioning + hold-and-drag engine behind BOTH docks: the quick
// actions (float / bubble) and the pinned-alters bubble. One implementation
// (the user's rule — reuse, don't fork): fixed to a screen edge at a
// remembered spot; hold the handle 300ms, drag anywhere, release → snaps
// to the nearest edge at that height and reports { side, topPct } to save.
// `renderHandle(bind)` draws the grab element; `bind` carries the pointer
// handlers and `suppressTap` (a ref — true right after a drag, so the
// handle's own onClick can ignore the trailing click).
export function EdgeDock({ side = "right", topPct = 50, onSavePos, renderHandle, children, className = "" }) {
  const [drag, setDrag] = useState(null); // { x, y }
  const dragState = useRef(null);
  const suppressTap = useRef(false);
  const horizontal = side === "top" || side === "bottom";
  // Measure the stack so the clamp uses its REAL size — a fixed guess let
  // the far end of a tall dock slide behind the chrome.
  const dockRef = useRef(null);
  const [dockSize, setDockSize] = useState({ w: 56, h: 220 });
  useEffect(() => {
    const node = dockRef.current;
    if (!node) return undefined;
    const measure = () => {
      const r = node.getBoundingClientRect();
      if (r.width && r.height) setDockSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [children]);

  const onPointerDown = (e) => {
    if (e.button === 1 || e.button === 2 || dragState.current) return;
    const node = e.currentTarget;
    const startX = e.clientX, startY = e.clientY;
    const st = { active: false, timer: null };
    const onMove = (ev) => {
      if (!st.active) {
        if (Math.abs(ev.clientX - startX) > 6 || Math.abs(ev.clientY - startY) > 6) cleanup();
        return;
      }
      setDrag({ x: ev.clientX, y: ev.clientY });
      ev.preventDefault();
    };
    const onTouchMove = (ev) => { if (st.active) ev.preventDefault(); };
    const onUp = (ev) => {
      const wasActive = st.active;
      cleanup();
      setDrag(null);
      if (!wasActive) return;
      suppressTap.current = true;
      const W = window.innerWidth, H = window.innerHeight;
      const dists = { left: ev.clientX, right: W - ev.clientX, top: ev.clientY, bottom: H - ev.clientY };
      const nextSide = Object.keys(dists).reduce((a, b) => (dists[a] <= dists[b] ? a : b));
      const along = nextSide === "top" || nextSide === "bottom" ? ev.clientX / W : ev.clientY / H;
      const pct = Math.min(88, Math.max(6, along * 100));
      onSavePos?.({ side: nextSide, topPct: Math.round(pct * 10) / 10 });
    };
    const cleanup = () => {
      if (st.timer) clearTimeout(st.timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("touchmove", onTouchMove);
      dragState.current = null;
    };
    dragState.current = st;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    st.timer = setTimeout(() => {
      st.active = true;
      try { node.setPointerCapture?.(e.pointerId); } catch { /* unsupported */ }
      try { navigator.vibrate?.(10); } catch { /* no haptics */ }
      setDrag({ x: startX, y: startY });
    }, 300);
  };
  const bind = { onPointerDown, onContextMenu: (e) => e.preventDefault(), suppressTap, side, horizontal };

  return (
    <div
      ref={dockRef}
      className={`fixed z-40 flex items-center ${horizontal ? "flex-row" : "flex-col"} ${className}`}
      style={drag ? {
        left: drag.x, top: drag.y,
        transform: "translate(-50%, -50%)",
        gap: "calc(var(--v2-space, 6px) * 0.75)",
        opacity: 0.9,
      } : horizontal ? {
        [side]: side === "top"
          ? "calc(var(--v2-status-h, 0px) + env(safe-area-inset-top, 0px) + 8px)"
          : "calc(var(--v2-bottom-chrome-h, var(--bottom-nav-height, 56px)) + var(--os-sab) + 8px)",
        left: `clamp(${8 + dockSize.w / 2}px, ${topPct}%, calc(100% - ${8 + dockSize.w / 2}px))`,
        transform: "translateX(-50%)",
        gap: "calc(var(--v2-space, 6px) * 0.75)",
      } : {
        [side]: "calc(env(safe-area-inset-" + side + ", 0px) + 8px)",
        // Clamp with the dock's measured height so its far end can never
        // slide behind the top or bottom chrome.
        top: `clamp(calc(var(--v2-status-h, 0px) + env(safe-area-inset-top, 0px) + ${8 + dockSize.h / 2}px), ${topPct}%, calc(100% - var(--v2-bottom-chrome-h, var(--bottom-nav-height, 56px)) - var(--os-sab) - ${8 + dockSize.h / 2}px))`,
        transform: "translateY(-50%)",
        gap: "calc(var(--v2-space, 6px) * 0.75)",
      }}
    >
      {typeof children === "function" ? children(bind) : children}
      {renderHandle?.(bind)}
    </div>
  );
}

