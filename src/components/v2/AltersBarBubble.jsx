// The pinned-{alters} bar as a BUBBLE (v0.190.1): a round button docked to
// any screen edge — hold-and-drag it anywhere, it snaps to the nearest
// edge at that height and remembers the spot (home.altersBar.bubble). Tap
// opens the card beside it: a column on the left/right edges, a row on
// top/bottom. Same drag grammar as the quick-actions bubble (hold 300ms,
// then drag), same save shape { side, topPct }.
import React, { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pin, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useTerms } from "@/lib/useTerms";
import AltersBarCard from "@/components/v2/AltersBarCard";

function BubbleFace({ alterId }) {
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const a = alters.find((x) => x.id === alterId);
  const url = useResolvedAvatarUrl(a?.avatar_url);
  if (!a) return <Pin style={{ width: "42%", height: "42%" }} />;
  return url
    ? <img src={url} alt="" className="w-full h-full object-cover rounded-full" />
    : <span className="text-sm font-semibold">{(a.name || "?").charAt(0).toUpperCase()}</span>;
}

export default function AltersBarBubble({ settingsRow, home, open, onToggle, onSavePos, onGear }) {
  const terms = useTerms();
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const primary = activeSessions.find((s) => s.is_primary) || activeSessions[0];
  const pos = (home?.altersBar && home.altersBar.bubble) || {};
  const side = ["left", "right", "top", "bottom"].includes(pos.side) ? pos.side : "right";
  const topPct = Number.isFinite(pos.topPct) ? pos.topPct : 60;
  const horizontal = side === "top" || side === "bottom";

  const [drag, setDrag] = useState(null);
  const dragState = useRef(null);
  const suppressTap = useRef(false);

  const onHandleDown = (e) => {
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

  const bubble = (
    <button type="button"
      onPointerDown={onHandleDown}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (suppressTap.current) { suppressTap.current = false; return; } onToggle?.(!open); }}
      aria-expanded={open}
      aria-label={open ? `Hide the pinned ${terms.alters}` : `Show the pinned ${terms.alters}`}
      title={`Tap to ${open ? "hide" : "show"} · hold and drag to move`}
      className="pointer-events-auto flex items-center justify-center overflow-hidden active:scale-95 transition-transform backdrop-blur select-none"
      style={{
        background: "var(--color-bg)",
        width: "calc(var(--v2-cmd-size, 44px) + 6px)", height: "calc(var(--v2-cmd-size, 44px) + 6px)",
        borderRadius: "9999px",
        border: "var(--v2-border-w, 1px) solid var(--v2-accent)",
        color: "var(--v2-accent)",
        boxShadow: "0 2px 10px rgb(0 0 0 / 0.3)",
        touchAction: "none",
      }}>
      {open
        ? <ChevronUp style={{ width: "40%", height: "40%", transform: side === "right" ? "rotate(90deg)" : side === "left" ? "rotate(-90deg)" : side === "top" ? "rotate(180deg)" : "none" }} />
        : <BubbleFace alterId={primary?.alter_id} />}
    </button>
  );

  const card = open && (
    <AltersBarCard settingsRow={settingsRow} home={home} onCollapse={() => onToggle?.(false)} onGear={onGear}
      orientation={horizontal ? "horizontal" : "vertical"} className={horizontal ? "max-w-[85vw]" : ""} />
  );

  return (
    <div
      className={`fixed z-40 flex items-center pointer-events-none ${horizontal ? "flex-row" : "flex-col"}`}
      style={drag ? {
        left: drag.x, top: drag.y, transform: "translate(-50%, -50%)", gap: 8, opacity: 0.9,
      } : horizontal ? {
        [side]: side === "top"
          ? "calc(var(--v2-status-h, 0px) + env(safe-area-inset-top, 0px) + 8px)"
          : "calc(var(--v2-bottom-chrome-h, 56px) + env(safe-area-inset-bottom, 0px) + 8px)",
        left: `clamp(40px, ${topPct}%, calc(100% - 40px))`,
        transform: "translateX(-50%)", gap: 8,
      } : {
        [side]: `calc(env(safe-area-inset-${side}, 0px) + 8px)`,
        top: `clamp(calc(var(--v2-status-h, 0px) + env(safe-area-inset-top, 0px) + 40px), ${topPct}%, calc(100% - var(--v2-bottom-chrome-h, 56px) - env(safe-area-inset-bottom, 0px) - 40px))`,
        transform: "translateY(-50%)", gap: 8,
      }}
    >
      {/* Card on the inner side of the bubble so it grows into the screen. */}
      {(side === "right" || side === "bottom") && card}
      {bubble}
      {(side === "left" || side === "top") && card}
    </div>
  );
}
