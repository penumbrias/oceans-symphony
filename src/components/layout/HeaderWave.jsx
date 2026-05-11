import React from "react";

// Thin double-sine wave underline for the app header. Sits absolutely at
// the bottom edge of its parent and tints itself with the user's primary
// theme colour via `currentColor`. Deliberately abstract — two stacked
// strokes at different opacities so the line reads as geometry, not as
// an ocean wave.
//
// Two design knobs:
//   - The SVG's viewBox is fixed at 120 × 8; preserveAspectRatio="none"
//     stretches it across the header width.
//   - The wrapper's `text-primary` provides currentColor for both
//     strokes — switching primary themes recolours the wave.
export default function HeaderWave() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 right-0 bottom-0 h-2 text-primary"
      style={{ opacity: 0.6 }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 120 8"
        preserveAspectRatio="none"
        className="block"
      >
        <path
          d="M0 5 Q 15 1 30 5 T 60 5 T 90 5 T 120 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        <path
          d="M0 6 Q 20 3 40 6 T 80 6 T 120 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.7"
          strokeOpacity="0.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
