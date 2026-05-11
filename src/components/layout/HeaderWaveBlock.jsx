import React from "react";

// Animated wave block that fills the top half of the app header with a
// slightly lighter hue, ending in a wavy bottom edge that scrolls
// slowly to the side — calm-waves vibe, deliberately understated.
//
// Two design choices worth noting:
//   1. The wave path is drawn inside a 240-wide viewBox and the SVG is
//      rendered at 200% width with preserveAspectRatio="none". The
//      keyframe slides the SVG from translateX(0) to translateX(-50%),
//      i.e. by exactly one viewBox-width, then loops — so the motion
//      is seamless because the path tiles to itself.
//   2. The fill is hsl(var(--primary) / 0.08) so it picks up the
//      user's accent colour at very low opacity — a wash rather than
//      a feature.
//
// Visual placement: parent header sets `position: relative` and
// contains the title/icons; this component lays a layer behind them
// with z-index: 0. Title/icons should be z-index ≥ 1 so the wave
// passes behind their middle.
export default function HeaderWaveBlock() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-1/2 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <svg
        className="absolute top-0 left-0 h-full app-header-wave-slide"
        style={{ width: "200%" }}
        viewBox="0 0 240 32"
        preserveAspectRatio="none"
      >
        {/* The wave fill: rectangle to y=22 then sine wave back to the
            left edge along y≈22, tiling at every 60 units so x=240
            lands at exactly the same phase as x=0. */}
        <path
          d="M0 0 L240 0 L240 22 Q225 18 210 22 T180 22 T150 22 T120 22 T90 22 T60 22 T30 22 T0 22 Z"
          fill="hsl(var(--primary))"
          fillOpacity="0.09"
        />
        {/* A second, slightly darker stroke along the wave edge so it
            reads as a distinct boundary even on themes where the fill
            is nearly invisible. */}
        <path
          d="M0 22 Q15 18 30 22 T60 22 T90 22 T120 22 T150 22 T180 22 T210 22 T240 22"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeOpacity="0.35"
          strokeWidth="0.8"
        />
      </svg>
    </div>
  );
}
