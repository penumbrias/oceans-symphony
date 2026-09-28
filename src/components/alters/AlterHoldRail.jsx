// Press-and-hold on an alter's avatar tile (grid views) → a small
// horizontal rail beside the finger with two choices:
//   • the front button — the same control as the list view's bolt (tap =
//     onto the top level / adjust, hold = the level rail)
//   • the action list — the alter's action menu
// Grid tiles have no room for a bolt of their own; this puts the list
// view's two controls one hold away instead of jumping straight into the
// menu.
//
// While it's open the page must not move: the finger that held is still
// down, and dragging it would otherwise scroll the page (or the widget
// board) underneath. A non-passive touchmove guard blocks scrolling until
// the rail closes; the backdrop takes every later touch.

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { List } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { FrontingToggleButton } from "./AlterCard";

const RAIL_W = 112;
const RAIL_H = 56;
const GAP = 10;

export default function AlterHoldRail({ alter, anchorEl, activeSessions = [], gesture, onOpenMenu, onClose }) {
  const t = useTerms();
  const backdropRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const r = anchorEl?.getBoundingClientRect?.();
    if (!r) { setPos({ left: (window.innerWidth - RAIL_W) / 2, top: window.innerHeight / 3 }); return; }
    const vw = window.innerWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - RAIL_W / 2), vw - RAIL_W - 8);
    const above = r.top - RAIL_H - GAP;
    const top = above > 8 ? above : r.bottom + GAP;
    setPos({ left, top });
  }, [anchorEl]);

  // Freeze page scrolling while open (touch + wheel), including the touch
  // that is still down from the hold.
  useEffect(() => {
    const block = (e) => { if (e.cancelable) e.preventDefault(); };
    document.addEventListener("touchmove", block, { passive: false });
    const bd = backdropRef.current;
    bd?.addEventListener("wheel", block, { passive: false });
    return () => {
      document.removeEventListener("touchmove", block);
      bd?.removeEventListener("wheel", block);
    };
  }, []);

  // Holding the front button opens the level rail; once that finishes
  // (commit or cancel), this rail's job is done.
  const railWasActive = useRef(false);
  useEffect(() => {
    if (gesture?.railActive) railWasActive.current = true;
    else if (railWasActive.current) onClose();
  }, [gesture?.railActive, onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!pos) return null;
  return createPortal(
    <div className="fixed inset-0 z-[85]" style={{ touchAction: "none" }}>
      <div
        ref={backdropRef}
        className="absolute inset-0"
        // pointerdown, not click: the lifting finger from the hold must
        // not count, and a new touch outside should close at once.
        onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        aria-hidden
      />
      <div
        role="toolbar"
        aria-label={alter.name}
        className="absolute flex items-center justify-around rounded-full border border-border bg-card shadow-2xl px-2 animate-in fade-in-0 zoom-in-95 duration-150"
        style={{ left: pos.left, top: pos.top, width: RAIL_W, height: RAIL_H }}
      >
        <FrontingToggleButton alter={alter} activeSessions={activeSessions} gesture={gesture} onDone={onClose} size="lg" />
        <button
          type="button"
          onClick={() => { onClose(); onOpenMenu(); }}
          aria-label={`${alter.name}: ${t.alter} options`}
          className="w-11 h-11 rounded-full flex items-center justify-center border-2 border-border/60 bg-muted/40 text-foreground hover:border-primary/60 active:scale-95 transition-all"
        >
          <List className="w-5 h-5" />
        </button>
      </div>
    </div>,
    document.body
  );
}
