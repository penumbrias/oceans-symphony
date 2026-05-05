import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import Grounding from "@/pages/Grounding";

const LS_KEY = "symphony_grounding_btn_pos";
const BTN_SIZE = 48;
const EDGE_MARGIN = 16;
const DRAG_THRESHOLD = 6;

function getEventXY(e) {
  if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function loadPos() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (saved && typeof saved.y === "number" && (saved.side === "left" || saved.side === "right")) {
      return saved;
    }
  } catch {}
  return { side: "right", y: window.innerHeight - 120 };
}

export default function FloatingGroundingButton() {
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
      }
      if (moved) {
        ev.preventDefault();
        currentX = x;
        const clampedY = Math.max(
          EDGE_MARGIN,
          Math.min(window.innerHeight - BTN_SIZE - EDGE_MARGIN, startY + dy)
        );
        setPos((prev) => ({ ...prev, y: clampedY }));
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
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
