import React from "react";

// Per-profile header wave — reuses the app HeaderWaveBlock's wave path, but
// filled with the profile's own `--color-wave` (set by the Body "Wave" custom
// colour). Rendered inside a profile header banner ONLY when the profile sets a
// wave colour, so it adopts that colour live. Sits behind the banner content
// (z-0); the banner's content is z-10. overflow-hidden on the banner clips it.
export default function ProfileWave() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden"
      style={{ zIndex: 0, height: "70%" }}
    >
      <svg
        className="absolute bottom-0 left-0 h-full app-header-wave-slide"
        style={{ width: "200%" }}
        viewBox="0 0 240 32"
        preserveAspectRatio="none"
      >
        {/* Same tiling wave path the app header uses, so the motion matches. */}
        <path
          d="M240 0 L0 0 L0 22 Q15 17 30 22 T60 22 T90 22 T120 22 T150 22 T180 22 T210 22 T240 22 Z"
          fill="var(--color-wave, #94A3B8)"
          fillOpacity="0.35"
        />
      </svg>
    </div>
  );
}
