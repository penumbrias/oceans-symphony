import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { readWaveColorKey, readWaveCustom } from "@/lib/waveColorKey";

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
//   2. Fill colour is user-pickable from Settings → Appearance → Wave
//      colour. Defaults to "muted" (a divider/chrome tone in the
//      palette) at 0.3 opacity. The user can switch to Background,
//      Surface, Primary, Secondary, Accent, Text, or Text 2nd —
//      anything in the Custom Colours grid.
//
// Visual placement: the wash sits in the top ~60% of the header so
// the wave's trough crosses just below the centre of the title and
// icons — gives the title a clearer "above the water" framing while
// keeping the icons mostly below the wash.
export default function HeaderWaveBlock() {
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList?.[0];
  const colorKey = readWaveColorKey(settings);
  const customWave = readWaveCustom(settings);

  // "background" means "no wave" — unless a fully-custom hex is set, which
  // always wins. Filling a wave with the page's background colour produces a
  // weirdly visible-but-invisible band, so picking Background = "no wave".
  if (!customWave && colorKey === "background") return null;

  // Map the "text-2nd" alias to the actual CSS var name. Every other
  // option matches `--color-<key>` 1:1.
  const cssVarKey = colorKey === "text-2nd"
    ? "text-secondary"
    : colorKey === "text"
      ? "text-primary"
      : colorKey;
  const fill = customWave || `var(--color-${cssVarKey}, #94A3B8)`;

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
        {/* Single filled wave path. We used to render a separate
            stroke along the bottom edge for extra definition, but at
            any opacity the overlap with the fill produced a visible
            darker outline — exactly the "seam" the user reported.
            Fill alone is seamless. */}
        <path
          d="M240 0 L0 0 L0 22 Q15 17 30 22 T60 22 T90 22 T120 22 T150 22 T180 22 T210 22 T240 22 Z"
          fill={fill}
          fillOpacity="0.3"
        />
      </svg>
    </div>
  );
}
