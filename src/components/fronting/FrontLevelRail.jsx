// The fronting-level rail — the owner's gesture: press and hold an active
// alter, a vertical spectrum of the user's levels appears, drag to a level,
// release to set it. One continuous gesture, no menu hopping.
//
// Two pieces:
//   • useHoldDragLevel — per-row hook. Stationary 350ms hold arms the rail
//     (movement first = scroll, cancelled); after arming, pointer moves pick
//     the nearest level and release commits. Window-level listeners so the
//     gesture survives re-renders of the row underneath.
//   • FrontLevelRail — the fixed overlay drawn while the gesture is live:
//     a vertical line with a dot + label per level, closest-to-front on top,
//     the picked level highlighted.
//
// Commit writes follow the canonical refetch-before-write rule for
// FrontingSession mutations (see useSwipeActions): fetch fresh active rows,
// update the target's front_level, invalidate ["activeFront"].

import React, { useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { frontLevelLabel } from "@/lib/frontLevels";

export const LEVEL_ROW_H = 44;
const HOLD_MS = 350;
const SLOP_PX = 8;

// Shared commit helper — usable outside the gesture too (modal, panel).
export async function commitFrontLevel({ alterId, levelId, queryClient }) {
  try {
    const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
    const session = fresh.find((s) => (s.alter_id || s.primary_alter_id) === alterId);
    if (!session) return false;
    if (session.front_level === levelId) return true;
    await base44.entities.FrontingSession.update(session.id, { front_level: levelId });
    queryClient?.invalidateQueries({ queryKey: ["activeFront"] });
    queryClient?.invalidateQueries({ queryKey: ["frontHistory"] });
    return true;
  } catch {
    toast.error("Couldn't save the level");
    return false;
  }
}

export function useHoldDragLevel({ cfg, onCommit }) {
  const [rail, setRail] = useState(null); // { alterId, x, y, pickedIndex }
  const timer = useRef(null);
  const origin = useRef(null);
  const live = useRef(null);

  const teardown = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
    if (live.current) {
      window.removeEventListener("pointermove", live.current.move);
      window.removeEventListener("pointerup", live.current.up);
      window.removeEventListener("pointercancel", live.current.cancel);
      live.current = null;
    }
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
    setRail(null);
  }, []);

  const getHoldProps = (alterId, currentLevelId) => {
    if (!cfg?.enabled) return {};
    return {
      onPointerDown: (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        origin.current = { x: e.clientX, y: e.clientY };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          try { navigator.vibrate?.(10); } catch { /* no haptics */ }
          // While the rail is live, dragging must not paint a text selection
          // across the page (the reported bug) — kill selection globally and
          // clear any that already started during the hold.
          document.body.style.userSelect = "none";
          document.body.style.webkitUserSelect = "none";
          try { window.getSelection()?.removeAllRanges(); } catch { /* fine */ }
          const startIndex = Math.max(0, cfg.levels.findIndex((l) => l.id === currentLevelId));
          const state = { alterId, x: origin.current.x, y: origin.current.y, pickedIndex: startIndex, startIndex };
          setRail(state);
          const pick = (ev) => {
            // The rail is centred on the press point at the CURRENT level's
            // row, so the finger starts on the level that's already set and
            // moving up/down walks the spectrum from there.
            const dy = ev.clientY - state.y;
            const idx = Math.min(
              cfg.levels.length - 1,
              Math.max(0, Math.round(startIndex + dy / LEVEL_ROW_H))
            );
            setRail((r) => (r ? { ...r, pickedIndex: idx } : r));
            state.pickedIndex = idx;
          };
          const move = (ev) => pick(ev);
          const up = () => {
            const picked = cfg.levels[state.pickedIndex];
            teardown();
            if (picked) onCommit(alterId, picked.id);
          };
          const cancel = () => teardown();
          live.current = { move, up, cancel };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", cancel);
        }, HOLD_MS);
      },
      onPointerMove: (e) => {
        // Before arming: any real movement is a scroll — cancel the hold.
        if (!timer.current || !origin.current) return;
        const dx = e.clientX - origin.current.x;
        const dy = e.clientY - origin.current.y;
        if (dx * dx + dy * dy > SLOP_PX * SLOP_PX) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      },
      onPointerUp: () => {
        // Released before arming — normal tap, just drop the pending hold.
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      },
      onContextMenu: (e) => { if (rail) e.preventDefault(); },
      style: { touchAction: rail ? "none" : undefined },
    };
  };

  return { rail, getHoldProps };
}

export function FrontLevelRail({ rail, cfg, alterName }) {
  const terms = useTerms();
  if (!rail || !cfg?.enabled) return null;
  const { levels } = cfg;
  // Anchor so the CURRENT level's row sits under the press point; clamp the
  // whole rail into the viewport.
  const railH = levels.length * LEVEL_ROW_H;
  const anchored = rail.y - ((rail.startIndex ?? 0) * LEVEL_ROW_H + LEVEL_ROW_H / 2);
  const top = Math.min(Math.max(8, anchored), window.innerHeight - railH - 8);
  const left = Math.min(Math.max(12, rail.x - 10), window.innerWidth - 190);
  return createPortal(
    <div className="fixed inset-0 z-[80]" style={{ touchAction: "none" }} aria-hidden="true">
      <div className="absolute inset-0 bg-background/50" />
      {alterName && (
        <div className="absolute px-2 py-0.5 rounded-md bg-background border border-border text-xs font-medium"
          style={{ left, top: Math.max(2, top - 26) }}>
          {alterName}
        </div>
      )}
      <div className="absolute" style={{ left, top }}>
        {/* the spectrum line */}
        <div className="absolute left-[9px] top-[10px] bottom-[10px] w-0.5 rounded bg-border" />
        {levels.map((level, i) => {
          const picked = i === rail.pickedIndex;
          return (
            <div key={level.id} className="relative flex items-center gap-2.5" style={{ height: LEVEL_ROW_H }}>
              <span
                className="rounded-full flex-shrink-0 transition-all"
                style={{
                  width: picked ? 20 : 10,
                  height: picked ? 20 : 10,
                  marginLeft: picked ? 0 : 5,
                  background: picked
                    ? "var(--color-primary)"
                    : "color-mix(in srgb, var(--color-primary) 35%, transparent)",
                }}
              />
              <span
                className={`px-2 py-0.5 rounded-md text-sm whitespace-nowrap border transition-colors ${
                  picked
                    ? "bg-primary text-primary-foreground border-transparent font-medium"
                    : "bg-background/90 text-muted-foreground border-border/60"
                }`}
              >
                {frontLevelLabel(level, terms)}
              </span>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
