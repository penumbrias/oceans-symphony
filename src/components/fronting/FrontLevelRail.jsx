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
import { frontLevelLabel, useFrontLevels } from "@/lib/frontLevels";
import { recomputePrimaryFromLevels } from "@/lib/setFront";
import { toggleFrontFor, removeFrontFor } from "@/hooks/useSwipeActions";

export const LEVEL_ROW_H = 44;
const HOLD_MS = 350;
// Movement that cancels a pending hold. Mouse: 8px is a deliberate drag.
// Touch: a resting fingertip drifts several px on its own — 8px cancelled
// real holds on phones (release then landed as a plain tap: "it just adds
// instead"). Touch gets a wide slop and lets the browser's own scroll
// detection (pointercancel) be the real judge of "this was a scroll".
const SLOP_PX = 8;
const TOUCH_SLOP_PX = 24;

// Shared commit helper — usable outside the gesture too (modal, panel).
// Pass cfg so the derived primary follows the spectrum (star retired).
export async function commitFrontLevel({ alterId, levelId, queryClient, cfg = null }) {
  try {
    const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
    const session = fresh.find((s) => (s.alter_id || s.primary_alter_id) === alterId);
    if (!session) return false;
    if (session.front_level !== levelId) {
      await base44.entities.FrontingSession.update(session.id, { front_level: levelId });
    }
    if (cfg?.enabled) await recomputePrimaryFromLevels({ cfg, queryClient: null });
    queryClient?.invalidateQueries({ queryKey: ["activeFront"] });
    try { window.dispatchEvent(new Event("symphony-front-changed")); } catch { /* SSR */ }
    queryClient?.invalidateQueries({ queryKey: ["frontHistory"] });
    return true;
  } catch {
    toast.error("Couldn't save the level");
    return false;
  }
}

export function useHoldDragLevel({ cfg, onCommit, onRemove }) {
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
      if (live.current.blockScroll) window.removeEventListener("touchmove", live.current.blockScroll);
      live.current = null;
    }
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
    setRail(null);
  }, []);

  const getHoldProps = (alterId, currentLevelId) => {
    if (!cfg?.enabled) return {};
    return {
      // This element answers a hold itself — the widget board checks for
      // this attribute before opening a widget's options on hold.
      "data-own-hold": "",
      onPointerDown: (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        origin.current = { x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse" };
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
          const maxIndex = cfg.levels.length - 1 + (onRemove ? 1 : 0);
          // Anchor the current level's row under the press point, then clamp
          // into the viewport ONCE, here — and from then on read the finger
          // against where the rail actually IS. (Clamping only at render
          // left the pick math assuming the unclamped position: near a
          // screen edge the finger hovered a gap and nothing selected.)
          const railH = (maxIndex + 1) * LEVEL_ROW_H;
          const anchoredTop = origin.current.y - (startIndex * LEVEL_ROW_H + LEVEL_ROW_H / 2);
          const top = Math.min(Math.max(8, anchoredTop), window.innerHeight - railH - 8);
          const pickAt = (clientY) =>
            Math.min(maxIndex, Math.max(0, Math.round((clientY - top - LEVEL_ROW_H / 2) / LEVEL_ROW_H)));
          const state = {
            alterId, x: origin.current.x, y: origin.current.y, top,
            pickedIndex: pickAt(origin.current.y), startIndex,
          };
          setRail(state);
          const pick = (ev) => {
            const idx = pickAt(ev.clientY);
            setRail((r) => (r ? { ...r, pickedIndex: idx } : r));
            state.pickedIndex = idx;
          };
          const move = (ev) => pick(ev);
          const up = () => {
            const idx = state.pickedIndex;
            teardown();
            if (onRemove && idx === cfg.levels.length) onRemove(alterId);
            else if (cfg.levels[idx]) onCommit(alterId, cfg.levels[idx].id);
          };
          const cancel = () => teardown();
          // Native scroll fires pointercancel the moment the finger moves,
          // killing the rail — touch-action is evaluated at touchstart, so
          // setting it now is too late. preventDefault on touchmove (non-
          // passive) is the one thing that still stops scrolling mid-touch.
          const blockScroll = (ev) => ev.preventDefault();
          window.addEventListener("touchmove", blockScroll, { passive: false });
          live.current = { move, up, cancel, blockScroll };
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
        const slop = origin.current.touch ? TOUCH_SLOP_PX : SLOP_PX;
        if (dx * dx + dy * dy > slop * slop) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      },
      onPointerUp: () => {
        // Released before arming — normal tap, just drop the pending hold.
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      },
      // The browser took the pointer for a scroll (or the OS interrupted):
      // never arm a rail nobody can finish.
      onPointerCancel: () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        origin.current = null;
      },
      // Always, not just while armed: text selection and the long-press
      // context menu/callout start DURING the hold, before the rail exists
      // — once the OS begins selecting it cancels the pointer stream and
      // the rail vanishes. These are gesture elements; selecting their
      // text is never the intent.
      onContextMenu: (e) => e.preventDefault(),
      style: {
        touchAction: rail ? "none" : undefined,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      },
    };
  };

  return { rail, getHoldProps };
}

// ── Static tap-to-pick variant ─────────────────────────────────────
// Swipe gestures can't flow into a drag, so surfaces whose "set primary"
// swipe was replaced by levels (owner decision: the star is retired when
// levels are on) open THIS instead: the same spectrum, centered, tap a
// level (or the remove stop) to commit, tap outside to cancel.
function LevelPickerOverlay({ alter, currentLevel, cfg, onClose, queryClient, terms }) {
  const rows = [
    ...cfg.levels,
    { id: "__remove", label: "Remove from {{front}}", _remove: true },
  ];
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center"
      onClick={onClose} role="dialog" aria-label={`Set ${terms.front} level for ${alter.name}`}>
      <div className="absolute inset-0 bg-background/60" />
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl px-3 py-2 min-w-[220px] overflow-y-auto overscroll-contain"
        style={{ maxHeight: "min(80vh, calc(100dvh - 48px))" }}
        onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium text-muted-foreground px-1 py-1.5 truncate">{alter.name}</p>
        {rows.map((level) => {
          const current = !level._remove && (currentLevel ? level.id === currentLevel : level.id === cfg.levels[0]?.id);
          return (
            <button
              key={level.id}
              type="button"
              onClick={async () => {
                onClose();
                if (level._remove) removeFrontFor(alter, base44, queryClient, toast, terms);
                else await commitFrontLevel({ alterId: alter.id, levelId: level.id, queryClient, cfg });
              }}
              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left text-sm transition-colors ${
                level._remove
                  ? "text-destructive hover:bg-destructive/10"
                  : current
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-foreground hover:bg-muted/50"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: level._remove ? "hsl(var(--destructive))" : current ? "var(--color-primary)" : "color-mix(in srgb, var(--color-primary) 35%, transparent)" }} />
              {frontLevelLabel(level, terms)}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

// The drop-in replacement for a "toggle primary" gesture callback. With
// levels OFF, trigger() returns false and the caller falls back to the
// classic togglePrimaryFor. With levels ON it opens the tap-to-pick
// spectrum for that alter (or explains they're not fronting).
export function usePrimaryGesture() {
  const cfg = useFrontLevels();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [pickFor, setPickFor] = useState(null);

  const trigger = async (alter) => {
    if (!cfg.enabled) return false;
    try {
      const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
      const session = fresh.find((s) => (s.alter_id || s.primary_alter_id) === alter.id);
      if (!session) {
        toast.info(`${alter.name} isn't ${terms.fronting} — add them to the ${terms.front} first`);
        return true;
      }
      setPickFor({ alter, currentLevel: session.front_level });
    } catch { /* leave closed */ }
    return true;
  };

  const node = pickFor ? (
    <LevelPickerOverlay
      alter={pickFor.alter}
      currentLevel={pickFor.currentLevel}
      cfg={cfg}
      terms={terms}
      queryClient={queryClient}
      onClose={() => setPickFor(null)}
    />
  ) : null;

  return { trigger, node, levelsOn: cfg.enabled };
}

// Plain press-and-hold → callback, with the same cancel-on-move and
// tap-suppression rules as the level rail. Used where hold opens the
// alter ACTION MENU rather than the spectrum (the alters page's chips and
// grid tiles — there, fronting lives on the bolt button instead).
export function useHoldMenu(onHold, { holdMs = 350 } = {}) {
  const timer = useRef(null);
  const origin = useRef(null);
  const suppress = useRef(0);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  return {
    suppressed: () => Date.now() < suppress.current,
    bind: {
      "data-own-hold": "",
      onContextMenu: (e) => e.preventDefault(),
      style: { userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" },
      onPointerDown: (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        origin.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = setTimeout(() => {
          timer.current = null;
          suppress.current = Date.now() + 400;
          try { navigator.vibrate?.(10); } catch { /* no haptics */ }
          onHold();
        }, holdMs);
      },
      onPointerMove: (e) => {
        if (!timer.current || !origin.current) return;
        const dx = e.clientX - origin.current.x;
        const dy = e.clientY - origin.current.y;
        if (dx * dx + dy * dy > 64) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onContextMenu: (e) => e.preventDefault(),
    },
  };
}

// ── The app-standard front gesture kit ─────────────────────────────
// One hook = the whole per-alter fronting interaction, identical on every
// surface (owner rule, v0.122.0 — the here-now widget defines the grammar):
//   • getHoldProps(alter, currentLevel) — press-and-hold opens the drag
//     rail (Remove stop included). Holding a NON-fronter adds them at the
//     level released on.
//   • quickSet(alter, session) — for explicit "set front" buttons: not
//     fronting → straight onto the TOP level; fronting → the tap-to-pick
//     spectrum for adjusting/removing.
//   • node — render once per surface (rail + picker portals).
//   • suppressed() — guard click handlers against the tap that follows a
//     completed hold.
export function useFrontGesture() {
  const cfg = useFrontLevels();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const altersRef = useRef({});
  const suppress = useRef(0);
  const [pickFor, setPickFor] = useState(null);

  const addOrLevel = async (alterId, levelId) => {
    const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
    const existing = fresh.find((s) => (s.alter_id || s.primary_alter_id) === alterId);
    if (!existing) {
      const alter = altersRef.current[alterId];
      if (alter) await toggleFrontFor(alter, fresh, base44, queryClient, toast, terms);
    }
    await commitFrontLevel({ alterId, levelId, queryClient, cfg });
  };

  const { rail, getHoldProps: rawHoldProps } = useHoldDragLevel({
    cfg,
    onCommit: (alterId, levelId) => {
      suppress.current = Date.now() + 400;
      addOrLevel(alterId, levelId);
    },
    onRemove: (alterId) => {
      suppress.current = Date.now() + 400;
      const alter = altersRef.current[alterId];
      if (alter) removeFrontFor(alter, base44, queryClient, toast, terms);
    },
  });

  const getHoldProps = (alter, currentLevel) => {
    if (!alter) return {};
    altersRef.current[alter.id] = alter;
    return rawHoldProps(alter.id, currentLevel);
  };

  const quickSet = async (alter, session) => {
    altersRef.current[alter.id] = alter;
    if (!session) {
      suppress.current = Date.now() + 400;
      await addOrLevel(alter.id, cfg.levels[0]?.id);
    } else {
      setPickFor({ alter, currentLevel: session.front_level });
    }
  };

  const railAlter = rail ? altersRef.current[rail.alterId] : null;
  const node = (
    <>
      <FrontLevelRail rail={rail} cfg={cfg} withRemove alterName={railAlter?.name || ""} />
      {pickFor && (
        <LevelPickerOverlay
          alter={pickFor.alter}
          currentLevel={pickFor.currentLevel}
          cfg={cfg}
          terms={terms}
          queryClient={queryClient}
          onClose={() => setPickFor(null)}
        />
      )}
    </>
  );

  return {
    getHoldProps, quickSet, node,
    railActive: !!rail,
    suppressed: () => !!rail || Date.now() < suppress.current,
    cfg,
  };
}

export function FrontLevelRail({ rail, cfg, alterName, withRemove = false }) {
  const terms = useTerms();
  if (!rail || !cfg?.enabled) return null;
  const { levels } = cfg;
  const rowCount = levels.length + (withRemove ? 1 : 0);
  const railH = rowCount * LEVEL_ROW_H;
  // The hook already anchored + clamped the top and picks against it;
  // older callers without rail.top fall back to the previous computation.
  const top = rail.top ?? Math.min(
    Math.max(8, rail.y - ((rail.startIndex ?? 0) * LEVEL_ROW_H + LEVEL_ROW_H / 2)),
    window.innerHeight - railH - 8,
  );
  // The dot column stays under the FINGER. When there's no room for the
  // labels on the right (a press near the right edge — pinned bar, grids),
  // they flip to the left instead of shoving the whole rail sideways.
  const flip = rail.x + 200 > window.innerWidth;
  const left = Math.min(Math.max(12, rail.x - 10), window.innerWidth - 32);
  return createPortal(
    <div className="fixed inset-0 z-[80] select-none" style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }} aria-hidden="true">
      <div className="absolute inset-0 bg-background/50" />
      {alterName && (
        <div className="absolute px-2 py-0.5 rounded-md bg-background border border-border text-xs font-medium whitespace-nowrap"
          style={{ ...(flip ? { right: window.innerWidth - left - 20 } : { left }), top: Math.max(2, top - 26) }}>
          {alterName}
        </div>
      )}
      <div className="absolute" style={{ left, top }}>
        {/* the spectrum line */}
        <div className="absolute left-[9px] top-[10px] bottom-[10px] w-0.5 rounded bg-border" />
        {[...levels, ...(withRemove ? [{ id: "__remove", label: `Remove from {{front}}`, _remove: true }] : [])].map((level, i) => {
          const picked = i === rail.pickedIndex;
          const accent = level._remove ? "hsl(var(--destructive))" : "var(--color-primary)";
          return (
            <div key={level.id} className="relative flex items-center" style={{ height: LEVEL_ROW_H, width: 20 }}>
              <span
                className="rounded-full flex-shrink-0 transition-all"
                style={{
                  width: picked ? 20 : 10,
                  height: picked ? 20 : 10,
                  marginLeft: picked ? 0 : 5,
                  background: picked ? accent : `color-mix(in srgb, ${accent} 35%, transparent)`,
                }}
              />
              <span
                className={`absolute px-2 py-0.5 rounded-md text-sm whitespace-nowrap border transition-colors ${
                  picked
                    ? (level._remove
                        ? "bg-destructive text-destructive-foreground border-transparent font-medium"
                        : "bg-primary text-primary-foreground border-transparent font-medium")
                    : `bg-background/90 border-border/60 ${level._remove ? "text-destructive/80" : "text-muted-foreground"}`
                }`}
                style={flip ? { right: 30 } : { left: 30 }}
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
