// The page background model + renderer (docs/v2-edit-menu-spec.md §4).
//
// One stored object per home board (ui_v2_home.background): flat color or
// image, a gradient whose stops can each be a COLOR or an IMAGE, or a
// positioned image — plus an optional audio track that doubles as the
// page song. The unified edit popup writes it; this file draws it.
//
// Rendered as a fixed -z-10 stack inside the board's isolate context —
// the same slot the legacy wallpaper paints in, so nothing above it is
// ever covered. When type is "none" the board falls back to the legacy
// wallpaper block unchanged.

import React from "react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

export const DEFAULT_BACKGROUND = Object.freeze({
  type: "none", // none (legacy wallpaper) | flat | gradient | image
  flat: { color: "", image: "" },
  gradient: {
    shape: "linear", angle: 135, strength: 50,
    stops: [{ color: "#4f46e5", image: "" }, { color: "#0ea5e9", image: "" }],
  },
  image: { url: "", position: "cover" },
  audio: null, // { ref, title, loop, autoplay, volume } — the page song
});

export function resolveBackground(stored) {
  const b = stored && typeof stored === "object" ? stored : {};
  return {
    ...DEFAULT_BACKGROUND,
    ...b,
    flat: { ...DEFAULT_BACKGROUND.flat, ...(b.flat || {}) },
    gradient: {
      ...DEFAULT_BACKGROUND.gradient,
      ...(b.gradient || {}),
      stops: Array.isArray(b.gradient?.stops) && b.gradient.stops.length >= 2
        ? b.gradient.stops.map((s) => ({ color: s?.color || "", image: s?.image || "" }))
        : DEFAULT_BACKGROUND.gradient.stops,
    },
    image: {
      ...DEFAULT_BACKGROUND.image,
      ...(b.image || {}),
      // A folder rotates the image on each app open, same engine as the
      // legacy wallpaper (the board resolves the pick before rendering).
      folder: typeof b.image?.folder === "string" ? b.image.folder : "",
      mode: b.image?.mode === "sequential" ? "sequential" : "random",
    },
    audio: b.audio && typeof b.audio === "object" ? b.audio : null,
  };
}

const POSITION_CSS = {
  cover: { backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" },
  fill: { backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" },
  tile: { backgroundSize: "auto", backgroundRepeat: "repeat" },
  stretch: { backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" },
  center: { backgroundSize: "auto", backgroundPosition: "center", backgroundRepeat: "no-repeat" },
};

// Even stop centres, with `strength` hardening each transition: at 0 the
// blend is the plain even gradient; at 100 each colour holds a solid band
// with an abrupt edge.
function gradientStopList(stops, strength) {
  const n = stops.length;
  const half = ((100 / Math.max(1, n - 1)) / 2) * (Math.max(0, Math.min(100, strength)) / 100);
  const parts = [];
  stops.forEach((s, i) => {
    const c = (i / (n - 1)) * 100;
    const color = s.image ? "transparent" : (s.color || "transparent");
    if (half > 0) {
      parts.push(`${color} ${Math.max(0, c - half).toFixed(1)}%`);
      parts.push(`${color} ${Math.min(100, c + half).toFixed(1)}%`);
    } else {
      parts.push(`${color} ${c.toFixed(1)}%`);
    }
  });
  return parts.join(", ");
}

function gradientCss(gradient) {
  const list = gradientStopList(gradient.stops, gradient.strength);
  return gradient.shape === "radial"
    ? `radial-gradient(circle, ${list})`
    : `linear-gradient(${gradient.angle}deg, ${list})`;
}

// A mask ramp that fades an image layer in around its stop position, so
// an image can BE one of the gradient's colors. First/last stops stay
// solid out to their own edge.
function stopMask(gradient, index) {
  const n = gradient.stops.length;
  const c = (index / (n - 1)) * 100;
  const band = 100 / Math.max(1, n - 1);
  const ramp = band * (1 - (Math.max(0, Math.min(100, gradient.strength)) / 100) * 0.8);
  const from = index === 0 ? 0 : c - band;
  const to = index === n - 1 ? 100 : c + band;
  const solidFrom = index === 0 ? 0 : c - (band - ramp);
  const solidTo = index === n - 1 ? 100 : c + (band - ramp);
  const list = [
    `transparent ${Math.max(0, from).toFixed(1)}%`,
    `black ${Math.max(0, solidFrom).toFixed(1)}%`,
    `black ${Math.min(100, solidTo).toFixed(1)}%`,
    `transparent ${Math.min(100, to).toFixed(1)}%`,
  ].join(", ");
  return gradient.shape === "radial"
    ? `radial-gradient(circle, ${list})`
    : `linear-gradient(${gradient.angle}deg, ${list})`;
}

function ImageLayer({ url, style }) {
  const resolved = useResolvedAvatarUrl(url || "");
  if (!resolved) return null;
  return <div className="absolute inset-0" style={{ backgroundImage: `url(${resolved})`, ...style }} />;
}

export default function PageBackground({ background }) {
  const bg = background;
  if (!bg || bg.type === "none") return null;

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
      {bg.type === "flat" && (bg.flat.image
        ? <ImageLayer url={bg.flat.image} style={POSITION_CSS.cover} />
        : <div className="absolute inset-0" style={{ background: bg.flat.color || "transparent" }} />)}

      {bg.type === "image" && (
        <ImageLayer url={bg.image.url} style={POSITION_CSS[bg.image.position] || POSITION_CSS.cover} />
      )}

      {bg.type === "gradient" && (
        <>
          <div className="absolute inset-0" style={{ backgroundImage: gradientCss(bg.gradient) }} />
          {bg.gradient.stops.map((s, i) => s.image ? (
            <ImageLayer key={i} url={s.image} style={{
              ...POSITION_CSS.cover,
              maskImage: stopMask(bg.gradient, i),
              WebkitMaskImage: stopMask(bg.gradient, i),
            }} />
          ) : null)}
        </>
      )}

    </div>
  );
}
