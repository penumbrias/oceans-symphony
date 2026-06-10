import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import Grounding from "@/pages/Grounding";
import {
  isGroundingButtonEnabled,
  setGroundingButtonEnabled,
  subscribeGroundingButton,
} from "@/lib/groundingButtonPrefs";
import { toast } from "sonner";

const LS_KEY = "symphony_grounding_btn_pos";
const BTN_SIZE = 48;
const EDGE_MARGIN = 16;
const DRAG_THRESHOLD = 6;

// The fixed bottom nav covers `--bottom-nav-height + safe-area-inset-bottom`
// at the bottom of the viewport. Without accounting for that, the
// button defaults under it and can be dragged into it. Read the CSS
// custom property so the same value applies whether the user has the
// nav set to compact, default, tall, or extra-tall.
function getBottomNavGuard() {
  try {
    const styles = getComputedStyle(document.documentElement);
    const navRaw = styles.getPropertyValue("--bottom-nav-height").trim() || "56px";
    const navPx = parseFloat(navRaw) || 56;
    // env(safe-area-inset-bottom) — temp element to resolve to px.
    const probe = document.createElement("div");
    probe.style.height = "env(safe-area-inset-bottom, 0px)";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const inset = probe.getBoundingClientRect().height || 0;
    probe.remove();
    return navPx + inset + EDGE_MARGIN;
  } catch {
    return 56 + EDGE_MARGIN;
  }
}

// The sticky top header sits at z-50; this button is z-40, so if it's
// dragged up into the header band it vanishes BEHIND the header and
// can't be grabbed again (the "stuck behind the header" bug). Mirror
// the bottom-nav guard: keep the button below the header + top
// safe-area inset. Header row is ~48px on mobile / ~64px on desktop —
// use 64 so it clears both, plus the inset and a margin. Applied during
// drag AND in loadPos, so a button already stuck up there is hoisted
// back into reach on the next open.
function getTopGuard() {
  try {
    const probe = document.createElement("div");
    probe.style.height = "env(safe-area-inset-top, 0px)";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const inset = probe.getBoundingClientRect().height || 0;
    probe.remove();
    return inset + 64 + EDGE_MARGIN;
  } catch {
    return 64 + EDGE_MARGIN;
  }
}

function getEventXY(e) {
  if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function loadPos() {
  const guard = getBottomNavGuard();
  const defaultY = Math.max(EDGE_MARGIN, window.innerHeight - BTN_SIZE - guard - 8);
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (saved && typeof saved.y === "number" && (saved.side === "left" || saved.side === "right")) {
      // Re-clamp persisted positions — users on a previous build may
      // have left the button dragged into where the bottom nav now
      // sits. Hoist it above the nav on next mount.
      const clampedY = Math.max(getTopGuard(), Math.min(window.innerHeight - BTN_SIZE - guard, saved.y));
      return { ...saved, y: clampedY };
    }
  } catch {}
  return { side: "right", y: defaultY };
}

export default function FloatingGroundingButton() {
  // User can hide this bubble entirely from Settings → Accessibility.
  // The hook subscribes to the prefs lib so a toggle elsewhere updates
  // this component live without a reload.
  const [enabled, setEnabled] = useState(() => isGroundingButtonEnabled());
  useEffect(() => subscribeGroundingButton(() => setEnabled(isGroundingButtonEnabled())), []);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(() => loadPos());
  const [isDragging, setIsDragging] = useState(false);
  // True while a drag is hovering the center-bottom "drag here to hide" target.
  const [overDrop, setOverDrop] = useState(false);
  const overDropRef = useRef(false);
  const posRef = useRef(pos);

  // The center-bottom dismiss zone — drop the bubble here to hide it. Tested
  // against the POINTER (not the clamped bubble) so it's reachable even though
  // the bubble can't be dragged below the bottom nav.
  const inDropZone = (x, y) => {
    const cx = window.innerWidth / 2;
    const halfW = Math.min(150, window.innerWidth * 0.3);
    const bandTop = window.innerHeight - getBottomNavGuard() - 110;
    return Math.abs(x - cx) <= halfW && y >= bandTop;
  };

  // Keep ref in sync so the drag closure always has the latest y
  useEffect(() => { posRef.current = pos; }, [pos]);

  // Persist position
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(pos));
  }, [pos]);

  // Holds the current drag's teardown so it can be force-run if the
  // drag is interrupted (see the abort effect below).
  const dragCleanupRef = useRef(null);

  // Abort any in-flight drag when the app backgrounds (phone sleep /
  // tab hidden) or the component unmounts. Without this, a drag whose
  // touchend never arrives (lost across a sleep/wake) leaves the window
  // move/up listeners attached and body overflow stuck "hidden" — which
  // is exactly the kind of state that wedges touch handling after wake.
  // Belt-and-braces: always force overflow back on too.
  useEffect(() => {
    const abort = () => {
      if (dragCleanupRef.current) dragCleanupRef.current();
      document.body.style.overflow = "";
    };
    const onVis = () => { if (document.hidden) abort(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", abort);
    window.addEventListener("pagehide", abort);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", abort);
      window.removeEventListener("pagehide", abort);
      abort();
    };
  }, []);

  const onPointerDown = (e) => {
    const start = getEventXY(e);
    const startY = posRef.current.y;
    let currentX = start.x;
    let moved = false;

    const onMove = (ev) => {
      const { x, y } = getEventXY(ev);
      const dx = x - start.x;
      const dy = y - start.y;
      if (!moved && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        moved = true;
        setIsDragging(true);
        document.body.style.overflow = "hidden";
      }
      if (moved) {
        ev.preventDefault();
        currentX = x;
        const clampedY = Math.max(
          getTopGuard(),
          Math.min(window.innerHeight - BTN_SIZE - getBottomNavGuard(), startY + dy)
        );
        setPos((prev) => ({ ...prev, y: clampedY }));
        const od = inDropZone(x, y);
        if (od !== overDropRef.current) { overDropRef.current = od; setOverDrop(od); }
      }
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      document.body.style.overflow = "";
      setIsDragging(false);
      setOverDrop(false);
      overDropRef.current = false;
      dragCleanupRef.current = null;
    };

    const onUp = () => {
      const didMove = moved;
      const droppedToHide = overDropRef.current;
      cleanup();
      if (didMove) {
        if (droppedToHide) {
          setGroundingButtonEnabled(false);
          toast("Support bubble hidden — turn it back on from Quick Support or Settings → Accessibility.");
          return;
        }
        const side = currentX < window.innerWidth / 2 ? "left" : "right";
        setPos((prev) => ({ ...prev, side }));
      } else {
        setOpen(true);
      }
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  const btnStyle = {
    top: pos.y,
    ...(pos.side === "right" ? { right: EDGE_MARGIN } : { left: EDGE_MARGIN }),
    cursor: isDragging ? "grabbing" : "grab",
    transition: isDragging ? "none" : "left 0.2s ease, right 0.2s ease",
  };

  // Hidden by user preference — bail out before rendering the button OR
  // the dialog (the dialog can only open via this button anyway, so a
  // stale `open === true` after toggling off would just be confusing).
  if (!enabled) return null;

  return (
    <>
      {/* Center-bottom "drag here to hide" target — only while dragging. */}
      {isDragging && (
        <div
          className="fixed left-0 right-0 z-[45] flex justify-center pointer-events-none"
          style={{ bottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)" }}
          aria-hidden="true"
        >
          <div className={`flex flex-col items-center gap-1 px-5 py-3 rounded-2xl border-2 border-dashed transition-colors ${overDrop ? "border-destructive bg-destructive/15 text-destructive scale-105" : "border-border bg-card/90 text-muted-foreground"}`}>
            <X className="w-5 h-5" />
            <span className="text-xs font-medium whitespace-nowrap">{overDrop ? "Release to hide" : "Drag here to hide"}</span>
          </div>
        </div>
      )}

      <button
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        className="fixed z-40 w-12 h-12 rounded-full bg-card border border-border/80 shadow-lg flex items-center justify-center hover:border-primary/30 select-none"
        style={btnStyle}
        title="Grounding & support"
        aria-label="Open grounding support"
      >
        <span className="text-xl select-none">🫧</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 pb-16 sm:pb-0"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg flex flex-col overflow-hidden"
            style={{ height: "calc(90vh - 64px)", maxHeight: "calc(90vh - 64px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/40 flex-shrink-0">
              <p className="text-sm font-semibold text-foreground">Support</p>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pb-6">
              <Grounding />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
