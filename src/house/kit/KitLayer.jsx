// A pop-up layer for the kit (step 1.2). Menus, the calendar and the time
// list are portaled to <body> so no scrolling panel can clip them, but they
// must still sit inside a [data-house] root for the tokens to reach them.
// This renders one: the nearest HouseRoot's attributes and paint, on a
// `display: contents` box, so it adds no box of its own.
//
// The pop-up inside places itself with `useAnchoredPosition`: fixed, under
// the trigger (or above it when there's no room), clamped to the viewport.

import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useHouse } from "@/house/tokens/HouseRoot";
import { usePopupZ } from "@/components/shared/popupLayer";
import { DropdownLayer } from "@/components/shared/SearchableSelect";

export default function KitLayer({ children }) {
  const house = useHouse();
  if (typeof document === "undefined") return null;
  const attrs = house
    ? {
        "data-house": "",
        "data-house-look": house.look,
        "data-house-variant": house.variant,
        "data-house-label": house.fonts?.labelIsPixel ? "pixel" : "body",
        style: { ...house.vars, display: "contents", background: "transparent" },
      }
    : { "data-house": "", style: { display: "contents" } };
  // DropdownLayer: inside a modal dialog or a vaul sheet, the pop-up becomes
  // the active focus scope while open (the same fix the shared pickers use).
  return createPortal(<div {...attrs}><DropdownLayer>{children}</DropdownLayer></div>, document.body);
}

// Fixed position for a pop-up anchored to `anchorRef`. Re-placed on scroll
// and resize while open.
export function useAnchoredPosition(anchorRef, popRef, open, { gap = 4 } = {}) {
  const [pos, setPos] = useState(null);
  const z = usePopupZ(250);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      const pop = popRef.current;
      const pw = pop ? pop.offsetWidth : 240;
      const ph = pop ? pop.offsetHeight : 240;
      const vw = window.innerWidth, vh = window.innerHeight;
      const left = Math.max(8, Math.min(a.left, vw - pw - 8));
      const below = a.bottom + gap;
      const fitsBelow = below + ph <= vh - 8;
      const top = fitsBelow || a.top - gap - ph < 8 ? Math.min(below, Math.max(8, vh - ph - 8)) : a.top - gap - ph;
      setPos({ left, top, zIndex: z });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, anchorRef, popRef, gap, z]);
  return pos;
}

// Close on a press outside both the anchor and the pop-up.
export function useOutsidePress(open, refs, onClose) {
  useLayoutEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (refs.some((r) => r.current && r.current.contains(e.target))) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, refs, onClose]);
}

// A pop-up anchored to a trigger: portaled into a house layer, placed by
// useAnchoredPosition, closed by Escape (focus goes back to the trigger) or
// a press outside. `role` and `label` describe it to screen readers.
export function KitPopover({ open, anchorRef, onClose, children, role = "dialog", label, className = "", id, popRef: outerRef, onKeyDown, inline = false, ...rest }) {
  const innerRef = React.useRef(null);
  const popRef = outerRef || innerRef;
  // `inline`: drawn in the page flow instead of floating (story sheets only,
  // so the proof grid can show an open pop-up in a full-page picture).
  const pos = useAnchoredPosition(anchorRef, popRef, open && !inline);
  useOutsidePress(open && !inline, [anchorRef, popRef], onClose);
  if (!open) return null;
  const Wrap = inline ? React.Fragment : KitLayer;
  return (
    <Wrap>
      <div
        ref={popRef}
        id={id}
        role={role}
        aria-label={label}
        className={`hk-pop${inline ? " hk-pop--inline" : ""} ${className}`}
        style={inline ? { position: "relative", marginTop: "var(--house-space-1)" } : pos ? pos : { visibility: "hidden", left: 0, top: 0 }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); onClose(); anchorRef.current?.focus?.(); return; }
          onKeyDown?.(e);
        }}
        {...rest}
      >
        {children}
      </div>
    </Wrap>
  );
}
