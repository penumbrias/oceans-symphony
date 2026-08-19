// The pinned-{alters} bar CARD — one component, two hosts (v0.189.1):
//   • the home board's bottom stack (ExperimentalDashboard) when there is
//     no bottom chrome to host it;
//   • the bottom chrome itself (V2Frame) on EVERY page — the user's spec:
//     it works like the quick-actions bar, so it shows wherever you are.
// Styled like a widget (same look pipeline: built-in/saved style under the
// bar's own fields, emitted as CSS variables, consumed by boxStyle) and
// carrying the bar's SET 5 (border / radius / text size / font). Swipe
// DOWN on the bar hides it (fast, mostly vertical — the level rail's slow
// vertical drag never does); the trailing click is eaten so the chip under
// the finger doesn't open a profile. touch-action pan-x keeps sideways
// chip scrolling while making vertical drags ours.
import React, { useRef } from "react";
import PinnedAltersGallery from "@/components/alters/PinnedAltersGallery";
import { lookToStyle, mergeLook, pickLook, userStyleId, resolveUserStyles } from "@/lib/widgetLook";
import { HOME_STYLES, getStyleLook } from "@/lib/homeStyles";
import { boxStyle } from "@/v2/primitives";

export const ALTERS_BAR_WIDGET_ID = "__alters_bar";

export function altersBarLook(look = {}, settingsRow, pageStyleId = "current") {
  const userStyles = resolveUserStyles(settingsRow?.ui_v2_styles);
  const savedId = userStyleId(look.style);
  const saved = savedId ? userStyles.find((s) => s.id === savedId) : null;
  const builtinId = HOME_STYLES.some((h) => h.id === look.style) ? look.style : pageStyleId;
  return mergeLook(mergeLook(getStyleLook(builtinId), saved?.look || {}), pickLook(look));
}

export default function AltersBarCard({ settingsRow, home, onCollapse, onGear, className = "" }) {
  const look = (home && home.altersBar && home.altersBar.look) || {};
  const valign = look.valign || "center";
  const justify = valign === "top" ? "flex-start" : valign === "bottom" ? "flex-end" : "center";
  const barLooks = settingsRow?.ui_v2?.barLooks?.alters || {};
  const lookStyle = lookToStyle(altersBarLook(look, settingsRow, home?.styleMode));

  const dragStart = useRef(null);
  const dragLast = useRef(null);
  const dragAt = useRef(null);
  const swiped = useRef(false);
  const endDrag = () => {
    const s0 = dragStart.current, s1 = dragLast.current;
    const dt = dragAt.current ? Date.now() - dragAt.current : 0;
    dragStart.current = null; dragLast.current = null; dragAt.current = null;
    if (!s0 || !s1) return;
    const dy = s1.y - s0.y, dx = Math.abs(s1.x - s0.x);
    if (dy > 32 && dy > dx && dt < 600) { swiped.current = true; onCollapse?.(); }
  };

  return (
    <div data-widget-content="1"
      // Lets the options sheet find THIS box — its colour swatches and
      // Peek probe `[data-widget-id]`.
      data-widget-id={ALTERS_BAR_WIDGET_ID}
      onPointerDownCapture={(e) => {
        dragStart.current = { x: e.clientX, y: e.clientY };
        dragLast.current = { x: e.clientX, y: e.clientY };
        dragAt.current = Date.now();
        swiped.current = false;
      }}
      onPointerMoveCapture={(e) => { if (dragStart.current) dragLast.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUpCapture={() => endDrag()}
      onPointerCancelCapture={() => endDrag()}
      onClickCapture={(e) => {
        if (!swiped.current) return;
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`pointer-events-auto max-w-full flex items-center gap-1 backdrop-blur-xl ${className}`}
      style={{
        touchAction: "pan-x",
        ...lookStyle,
        ...boxStyle(),
        ...(barLooks.borderW !== undefined ? { "--v2-border-w": `${barLooks.borderW}px` } : {}),
        ...(barLooks.radius !== undefined ? { "--v2-radius": `${barLooks.radius}px` } : {}),
        ...(barLooks.fontScale !== undefined ? { fontSize: `${barLooks.fontScale}%` } : {}),
        ...(barLooks.font ? { fontFamily: barLooks.font } : {}),
        // Real tokens only: this app has no --background / --border vars.
        backgroundColor: "var(--v2-widget-bg, color-mix(in srgb, var(--color-surface) 90%, transparent))",
        borderRadius: "var(--v2-radius, 1rem)",
        padding: "var(--v2-pad, 0.25rem 0.5rem)",
        boxShadow: "var(--v2-shadow, 0 10px 15px -3px rgb(0 0 0 / 0.1))",
        alignItems: justify,
      }}>
      <div className="min-w-0 overflow-x-auto flex-1">
        <PinnedAltersGallery showHeader={false} showGear={!!onGear} onGear={onGear} valign={valign} />
      </div>
    </div>
  );
}
