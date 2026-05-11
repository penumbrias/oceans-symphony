import React from "react";

// Animated wave block that fills the header's upper portion with a
// slightly lighter hue, ending in a wavy bottom edge that scrolls
// slowly to the side — calm-waves vibe, deliberately understated but
// distinct enough to read as a sky/water boundary rather than a
// near-invisible wash.
//
// Two design choices worth noting:
//   1. The wave path is drawn inside a 240-wide viewBox and the SVG is
//      rendered at 200% width with preserveAspectRatio="none". The
//      keyframe slides the SVG from translateX(0) to translateX(-50%),
//      i.e. by exactly one viewBox-width, then loops — so the motion
//      is seamless because the path tiles to itself.
//   2. Fill is hsl(var(--primary) / 0.18) so it picks up the user's
//      accent colour, visible enough that the sky/water boundary
//      reads at a glance without dominating the chrome.
//
// Visual placement: the wash sits in the top ~60% of the header so
// the wave's trough crosses just below the centre of the title and
// icons — gives the title a clearer "above the water" framing while
// keeping the icons mostly below the wash.
export default function HeaderWaveBlock() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
      style={{ zIndex: 0, height: "62%" }}
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
          d="M0 0 L240 0 L240 22 Q225 17 210 22 T180 22 T150 22 T120 22 T90 22 T60 22 T30 22 T0 22 Z"
          fill="hsl(var(--primary))"
          fillOpacity="0.18"
        />
        {/* A second, darker stroke along the wave edge so the boundary
            reads clearly even on themes where the fill is muted. */}
        <path
          d="M0 22 Q15 17 30 22 T60 22 T90 22 T120 22 T150 22 T180 22 T210 22 T240 22"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeOpacity="0.55"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
