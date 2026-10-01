// Press-and-hold on an alter's avatar tile (grid views) → a small
// horizontal rail beside the finger with two choices:
//   • the front button — the same control as the list view's bolt (tap =
//     onto the top level / adjust, hold = the level rail)
//   • the action list — the alter's action menu
// Grid tiles have no room for a bolt of their own; this puts the list
// view's two controls one hold away instead of jumping straight into the
// menu.
//
// Slide to choose: the finger that held is still down when the rail
// appears, so sliding it onto an option and lifting picks that option —
// no second tap needed. Lifting anywhere else leaves the rail open for
// ordinary taps. Sliding onto the FRONT button doesn't wait for the lift:
// it opens the front level rail right there, under the same finger, so
// the slide carries on to a level (owner, 2026-10-01 — it used to just
// "tap" the button). With front levels off, lifting on it taps it as before.
//
// While it's open the page must not move: the finger that held is still
// down, and dragging it would otherwise scroll the page (or the widget
// board) underneath. A non-passive touchmove guard blocks scrolling until
// the rail closes; the backdrop takes every later touch.
//
// useAlterHoldRail() is the host for lists that render many alters from
// one component (the board's pinned-alters widget): one rail, one menu,
// press-and-hold handlers per alter.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { List } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { FrontingToggleButton } from "./AlterCard";
import AlterActionMenu from "./AlterActionMenu";
import { useFrontGesture } from "@/components/fronting/FrontLevelRail";

const RAIL_W = 112;
const RAIL_H = 56;
const GAP = 10;

export default function AlterHoldRail({ alter, anchorEl, activeSessions = [], gesture, onOpenMenu, onClose }) {
  const t = useTerms();
  const backdropRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [hovered, setHovered] = useState(null);
  const hoveredRef = useRef(null);

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

  // Slide-to-choose for the press that opened the rail. Only the FIRST
  // lift counts: after it, the rail behaves like any tap target.
  useEffect(() => {
    let armed = true;
    const optionAt = (x, y) => document.elementFromPoint(x, y)?.closest?.("[data-rail-option]") || null;
    const onMove = (e) => {
      if (!armed) return;
      const el = optionAt(e.clientX, e.clientY);
      const id = el?.getAttribute("data-rail-option") || null;
      if (id === "front") {
        const session = activeSessions.find((x) => (x.alter_id || x.primary_alter_id) === alter.id) || null;
        if (gesture?.startRailAt?.(alter, session?.front_level, e.clientX, e.clientY)) {
          armed = false;
          hoveredRef.current = null;
          setHovered(null);
          return;
        }
      }
      if (id !== hoveredRef.current) {
        hoveredRef.current = id;
        setHovered(id);
        if (id) { try { navigator.vibrate?.(8); } catch { /* no haptics */ } }
      }
    };
    const onUp = (e) => {
      if (!armed) return;
      armed = false;
      const el = optionAt(e.clientX, e.clientY);
      hoveredRef.current = null;
      setHovered(null);
      // The front option wraps its button; click the button itself.
      if (el) (el.matches("button") ? el : el.querySelector("button"))?.click();
    };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    return () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Handed off to the level rail: it's the only thing on screen now.
  if (gesture?.railActive) return null;
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
        <span data-rail-option="front" className={`rounded-full transition-transform ${hovered === "front" ? "scale-125" : ""}`}>
          <FrontingToggleButton alter={alter} activeSessions={activeSessions} gesture={gesture} onDone={onClose} size="lg" />
        </span>
        <button
          type="button"
          data-rail-option="list"
          onClick={() => { onClose(); onOpenMenu(); }}
          aria-label={`${alter.name}: ${t.alter} options`}
          className={`w-11 h-11 rounded-full flex items-center justify-center border-2 bg-muted/40 text-foreground hover:border-primary/60 active:scale-95 transition-all ${
            hovered === "list" ? "scale-125 border-primary" : "border-border/60"
          }`}
        >
          <List className="w-5 h-5" />
        </button>
      </div>
    </div>,
    document.body
  );
}

// One rail + one menu for a whole list of alters. bind(alter) goes on each
// alter's element; guard its tap with suppressed(). Same hold rules as
// useHoldMenu: hold still for holdMs, any early movement is a scroll.
export function useAlterHoldRail({ activeSessions = [], holdMs = 350 } = {}) {
  const gesture = useFrontGesture();
  const [railFor, setRailFor] = useState(null); // { alter, anchorEl }
  const [menuFor, setMenuFor] = useState(null);
  const timer = useRef(null);
  const origin = useRef(null);
  const suppressUntil = useRef(0);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const closeRail = useCallback(() => setRailFor(null), []);

  const bind = (alter) => ({
    "data-own-hold": "",
    onContextMenu: (e) => e.preventDefault(),
    style: { userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" },
    onPointerDown: (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const anchorEl = e.currentTarget;
      origin.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        suppressUntil.current = Date.now() + 400;
        try { navigator.vibrate?.(10); } catch { /* no haptics */ }
        setRailFor({ alter, anchorEl });
      }, holdMs);
    },
    onPointerMove: (e) => {
      const o = origin.current;
      if (!o || !timer.current) return;
      const dx = e.clientX - o.x;
      const dy = e.clientY - o.y;
      if (dx * dx + dy * dy > 64) clear();
    },
    onPointerUp: () => { clear(); origin.current = null; },
    onPointerCancel: () => { clear(); origin.current = null; },
  });

  const session = (a) => activeSessions.find((s) => (s.alter_id || s.primary_alter_id) === a?.id) || null;
  const node = (
    <>
      {gesture.node}
      {railFor && (
        <AlterHoldRail alter={railFor.alter} anchorEl={railFor.anchorEl} activeSessions={activeSessions}
          gesture={gesture} onOpenMenu={() => setMenuFor(railFor.alter)} onClose={closeRail} />
      )}
      {menuFor && (
        <AlterActionMenu alter={menuFor} activeSessions={activeSessions} session={session(menuFor)}
          onClose={() => setMenuFor(null)} />
      )}
    </>
  );
  return { bind, node, suppressed: () => !!railFor || Date.now() < suppressUntil.current };
}
