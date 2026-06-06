// A backdrop image element on the inner-world canvas (InnerWorldImage).
// NOT a location — purely decorative. Always rendered BELOW locations and
// alters. Mirrors LocationNode's drag + resize-handle + local-image://
// resolution. `locked` (image is_locked, a locked layer, or global view
// mode) disables move/resize/edit — the image still displays + can be tapped.

import React, { useRef, useState, useEffect } from "react";

const MIN = 40;

export default function MapImageNode({ image, isSelected, locked = false, zoom = 1, onSelect, onUpdate, onEdit }) {
  const { x = 0, y = 0, width = 320, height = 220, opacity = 1, rotation = 0, image_url } = image;
  const [resolvedUrl, setResolvedUrl] = useState(image_url || null);
  const dragStart = useRef(null);

  useEffect(() => {
    if (!image_url) { setResolvedUrl(null); return; }
    if (!image_url.startsWith("local-image://")) { setResolvedUrl(image_url); return; }
    import("@/lib/imageUrlResolver").then(({ resolveImageUrl }) => {
      resolveImageUrl(image_url).then((u) => setResolvedUrl(u || image_url));
    });
  }, [image_url]);

  const handleMouseDown = (e) => {
    e.stopPropagation();
    dragStart.current = { mx: e.clientX, my: e.clientY, x, y, moved: false };
    const onMove = (ev) => {
      if (!dragStart.current) return;
      const dx = (ev.clientX - dragStart.current.mx) / zoom;
      const dy = (ev.clientY - dragStart.current.my) / zoom;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragStart.current.moved = true;
      if (!locked) onUpdate({ x: dragStart.current.x + dx, y: dragStart.current.y + dy });
    };
    const onUp = () => {
      if (dragStart.current && !dragStart.current.moved) onSelect?.();
      dragStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleTouchStart = (e) => {
    e.stopPropagation();
    const t = e.touches[0];
    dragStart.current = { mx: t.clientX, my: t.clientY, x, y, moved: false, time: Date.now() };
  };
  const handleTouchMove = (e) => {
    if (!dragStart.current) return;
    e.stopPropagation();
    const t = e.touches[0];
    const dx = (t.clientX - dragStart.current.mx) / zoom;
    const dy = (t.clientY - dragStart.current.my) / zoom;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragStart.current.moved = true;
    if (!locked) onUpdate({ x: dragStart.current.x + dx, y: dragStart.current.y + dy });
  };
  const handleTouchEnd = (e) => {
    if (!dragStart.current) return;
    e.stopPropagation();
    if (!dragStart.current.moved && Date.now() - dragStart.current.time < 500) onSelect?.();
    dragStart.current = null;
  };

  const handleResizeDown = (e) => {
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, sw = width, sh = height;
    const onMove = (ev) => onUpdate({ width: Math.max(MIN, sw + (ev.clientX - sx) / zoom), height: Math.max(MIN, sh + (ev.clientY - sy) / zoom) });
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const handleResizeTouch = (e) => {
    e.stopPropagation();
    const t = e.touches[0];
    const sx = t.clientX, sy = t.clientY, sw = width, sh = height;
    const onMove = (ev) => onUpdate({ width: Math.max(MIN, sw + (ev.touches[0].clientX - sx) / zoom), height: Math.max(MIN, sh + (ev.touches[0].clientY - sy) / zoom) });
    const onUp = () => { window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp); };
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  };

  const cx = x + width / 2, cy = y + height / 2;
  return (
    <g transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined} style={{ touchAction: "none" }}>
      {resolvedUrl ? (
        <image href={resolvedUrl} x={x} y={y} width={width} height={height} opacity={opacity} preserveAspectRatio="xMidYMid slice"
          style={{ cursor: locked ? "default" : "grab" }}
          onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} />
      ) : (
        <rect x={x} y={y} width={width} height={height} fill="var(--color-muted)" opacity={0.3}
          onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} />
      )}
      {isSelected && (
        <>
          <rect x={x} y={y} width={width} height={height} fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6,3" pointerEvents="none" />
          {!locked && (
            <>
              <rect x={x + width - 18} y={y + height - 18} width={18} height={18} fill="#3b82f6" opacity={0.6} rx={2}
                style={{ cursor: "se-resize", touchAction: "none" }} onMouseDown={handleResizeDown} onTouchStart={handleResizeTouch} />
              <g onMouseDown={(e) => { e.stopPropagation(); onEdit?.(); }} onTouchStart={(e) => { e.stopPropagation(); onEdit?.(); }} style={{ cursor: "pointer" }}>
                <rect x={x + 4} y={y + 4} width={22} height={22} rx={4} fill="#3b82f6" opacity={0.85} />
                <text x={x + 15} y={y + 19} textAnchor="middle" fontSize={12} fill="white" pointerEvents="none">✎</text>
              </g>
            </>
          )}
          {locked && <text x={x + 8} y={y + 20} fontSize={14} pointerEvents="none">🔒</text>}
        </>
      )}
    </g>
  );
}
