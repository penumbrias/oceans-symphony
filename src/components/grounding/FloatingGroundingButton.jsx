import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import Grounding from "@/pages/Grounding";
import {
  isGroundingButtonEnabled,
  subscribeGroundingButton,
} from "@/lib/groundingButtonPrefs";

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
      const clampedY = Math.max(EDGE_MARGIN, Math.min(window.innerHeight - BTN_SIZE - guard, saved.y));
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
  const posRef = useRef(pos);

  // Keep ref in sync so the drag closure always has the latest y
  useEffect(() => { posRef.current = pos; }, [pos]);

  // Persist position
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(pos));
  }, [pos]);

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
          EDGE_MARGIN,
          Math.min(window.innerHeight - BTN_SIZE - getBottomNavGuard(), startY + dy)
        );
        setPos((prev) => ({ ...prev, y: clampedY }));
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      document.body.style.overflow = "";
      setIsDragging(false);

      if (moved) {
        const side = currentX < window.innerWidth / 2 ? "left" : "right";
        setPos((prev) => ({ ...prev, side }));
      } else {
        setOpen(true);
      }
    };

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
