import React, { useRef, useState } from "react";
import { Lock } from "lucide-react";

const MIN_SIZE = 80;

export default function LocationNode({ location, isSelected, onSelect, onUpdate, onDelete, zoom = 1 }) {
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(null); // "se" corner handle
  const dragStart = useRef(null);

  const { x, y, width = 200, height = 150, color = "#6366f1", shape = "rectangle", name, background_image_url, background_opacity, is_locked } = location;

  const handleMouseDown = (e) => {
    if (is_locked) {
      e.stopPropagation();
      onSelect(location);
      return;
    }
    e.stopPropagation();
    onSelect(location);
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, x, y };

    const onMove = (ev) => {
      if (!dragStart.current) return;
      const dx = (ev.clientX - dragStart.current.mx) / zoom;
      const dy = (ev.clientY - dragStart.current.my) / zoom;
      onUpdate({ x: dragStart.current.x + dx, y: dragStart.current.y + dy });
    };
    const onUp = () => {
      setDragging(false);
      dragStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleTouchStart = (e) => {
    if (is_locked) {
      e.stopPropagation();
      onSelect(location);
      return;
    }
    e.stopPropagation();
    onSelect(location);
    setDragging(true);
    dragStart.current = { mx: e.touches[0].clientX, my: e.touches[0].clientY, x, y };
  };

  const handleTouchMove = (e) => {
    e.stopPropagation();
    if (!dragStart.current) return;
    const dx = (e.touches[0].clientX - dragStart.current.mx) / zoom;
    const dy = (e.touches[0].clientY - dragStart.current.my) / zoom;
    onUpdate({ x: dragStart.current.x + dx, y: dragStart.current.y + dy });
  };

  const handleTouchEnd = (e) => {
    e.stopPropagation();
    setDragging(false);
    dragStart.current = null;
  };

  const handleResizeDown = (e) => {
    if (is_locked) {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    const startMx = e.clientX;
    const startMy = e.clientY;
    const startW = width;
    const startH = height;

    const onMove = (ev) => {
      const dw = (ev.clientX - startMx) / zoom;
      const dh = (ev.clientY - startMy) / zoom;
      onUpdate({ width: Math.max(MIN_SIZE, startW + dw), height: Math.max(MIN_SIZE, startH + dh) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleResizeTouchStart = (e) => {
    if (is_locked) {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    const startMx = e.touches[0].clientX;
    const startMy = e.touches[0].clientY;
    const startW = width;
    const startH = height;

    const onMove = (ev) => {
      const dw = (ev.touches[0].clientX - startMx) / zoom;
      const dh = (ev.touches[0].clientY - startMy) / zoom;
      onUpdate({ width: Math.max(MIN_SIZE, startW + dw), height: Math.max(MIN_SIZE, startH + dh) });
    };
    const onUp = () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  };

  const fill = color + "26"; // 15% opacity
  const borderColor = color;
  const isOval = shape === "oval";
  const rx = isOval ? width / 2 : 8;
  const ry = isOval ? height / 2 : 8;

  return (
    <g style={{ cursor: is_locked ? "not-allowed" : dragging ? "grabbing" : "grab", touchAction: "none" }}>
      <defs>
        {background_image_url && (
          <>
            <clipPath id={`loc-clip-${location.id}`}>
              <rect x={x} y={y} width={width} height={height} rx={rx} ry={ry} />
            </clipPath>
            <pattern id={`loc-bg-${location.id}`} patternUnits="userSpaceOnUse" x={x} y={y} width={width} height={height}>
              <image href={background_image_url} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" opacity={background_opacity ?? 0.7} />
            </pattern>
          </>
        )}
      </defs>

      {/* Background fill */}
      <rect
        x={x} y={y} width={width} height={height}
        rx={rx} ry={ry}
        fill={background_image_url ? `url(#loc-bg-${location.id})` : fill}
        stroke={borderColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        strokeDasharray={isSelected ? "6,3" : "none"}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Name label */}
      <text
        x={x + width / 2} y={y + 18}
        textAnchor="middle"
        fontSize={12}
        fontWeight="600"
        fill={color}
        pointerEvents="none"
        style={{ userSelect: "none" }}
      >
        {name?.length > 20 ? name.slice(0, 18) + "…" : name}
      </text>

      {/* Resize handle (bottom-right) */}
      {!is_locked && (
        <rect
          x={x + width - 10} y={y + height - 10}
          width={10} height={10}
          fill={borderColor}
          opacity={0.6}
          rx={2}
          style={{ cursor: "se-resize", touchAction: "none" }}
          onMouseDown={handleResizeDown}
          onTouchStart={handleResizeTouchStart}
        />
      )}

      {/* Lock indicator */}
      {is_locked && (
        <text
          x={x + width - 12} y={y + 14}
          fontSize={12}
          fill={color}
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          🔒
        </text>
      )}
    </g>
  );
}