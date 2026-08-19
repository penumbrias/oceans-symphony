// The pinned-{alters} bar as a BUBBLE: the quick-actions bubble's engine
// (EdgeDock — fixed to an edge, hold-and-drag, snap, remember) with the
// alters card as its content. Tap the bubble to open; on the left/right
// edges the card is a column, on top/bottom a row. Position lives in
// home.altersBar.bubble { side, topPct }.
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Pin, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useTerms } from "@/lib/useTerms";
import AltersBarCard from "@/components/v2/AltersBarCard";
import { EdgeDock } from "@/components/v2/EdgeDock";

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
  const rot = side === "right" ? "rotate(90deg)" : side === "left" ? "rotate(-90deg)" : side === "top" ? "rotate(180deg)" : "none";

  return (
    <EdgeDock side={side} topPct={topPct} onSavePos={onSavePos} className="pointer-events-none"
      renderHandle={(bind) => (
        <button type="button"
          onPointerDown={bind.onPointerDown}
          onContextMenu={bind.onContextMenu}
          onClick={() => { if (bind.suppressTap.current) { bind.suppressTap.current = false; return; } onToggle?.(!open); }}
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
            // The card sits on the bubble's inner side so it grows into the
            // screen: left/top docks draw the bubble first.
            order: side === "left" || side === "top" ? 0 : 2,
          }}>
          {open
            ? <ChevronUp style={{ width: "40%", height: "40%", transform: rot }} />
            : <BubbleFace alterId={primary?.alter_id} />}
        </button>
      )}>
      {open && (
        <div style={{ order: 1 }}>
          <AltersBarCard settingsRow={settingsRow} home={home} onCollapse={() => onToggle?.(false)} onGear={onGear}
            orientation={horizontal ? "horizontal" : "vertical"} className={horizontal ? "max-w-[85vw]" : ""} />
        </div>
      )}
    </EdgeDock>
  );
}
