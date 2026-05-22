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
//   2. Fill uses var(--color-surface) so the wave inherits the user's
//      "Surface" palette colour from Settings → Appearance → Custom
//      colors. Surface reads as a quiet background tone (vs Primary
//      which is the accent), so the wave sits behind the title as
//      a soft wash rather than competing with brand colour.
//
// Visual placement: the wash sits in the top ~60% of the header so
// the wave's trough crosses just below the centre of the title and
// icons — gives the title a clearer "above the water" framing while
// keeping the icons mostly below the wash.
export default function HeaderWaveBlock() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden landscape:hidden"
      style={{ zIndex: 0, height: "62%" }}
    >
      <svg
        className="absolute top-0 left-0 h-full app-header-wave-slide"
        style={{ width: "200%" }}
        viewBox="0 0 240 32"
        preserveAspectRatio="none"
      >
        {/* The wave fill. Both the fill outline and the stroke below
            walk the wave LEFT-to-RIGHT so SVG's `T` smooth-quadratic
            reflections produce identical phases — drawing fill right-
            to-left and stroke left-to-right (the previous shape) put
            the two wave paths 180° out of phase: the fill's peaks
            landed where the stroke's troughs landed and vice versa.
            Now both peak / trough at the same x positions. */}
        <path
          d="M240 0 L0 0 L0 22 Q15 17 30 22 T60 22 T90 22 T120 22 T150 22 T180 22 T210 22 T240 22 Z"
          fill="var(--color-surface, #E0F2FE)"
          fillOpacity="0.8"
        />
        {/* A second, slightly darker stroke along the wave edge so the
            boundary still reads clearly on themes where the surface
            colour is very close to the background. */}
        <path
          d="M0 22 Q15 17 30 22 T60 22 T90 22 T120 22 T150 22 T180 22 T210 22 T240 22"
          fill="none"
          stroke="var(--color-surface, #E0F2FE)"
          strokeOpacity="0.8"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
