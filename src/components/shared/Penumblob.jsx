// Penumblob, the guide (drawn by the owner). One sprite everywhere the app
// speaks as a guide: the Home guide panel, the Tour, "How this page works"
// and "Show me around". Still by default; the two-frame wave plays for a
// moment only when `cue` changes to something new, or when tapped, and never
// when the device asks for reduced motion.
import React, { useEffect, useState } from "react";
import penumblobStill from "@/assets/penumblob/penumblob.png";
import penumblobWave from "@/assets/penumblob/penumblob-wave.png";

const WAVE_MS = 1400;

function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

// `size` (px or any CSS length) sets the drawn size; leave it off to size it
// from a class instead.
export default function Penumblob({ cue = null, size, className = "", style }) {
  const [waving, setWaving] = useState(false);
  const wave = () => { if (!reducedMotion()) setWaving(true); };
  useEffect(() => { if (cue != null) wave(); }, [cue]);
  useEffect(() => {
    if (!waving) return undefined;
    const t = setTimeout(() => setWaving(false), WAVE_MS);
    return () => clearTimeout(t);
  }, [waving]);
  // A tap is a small hello, not an action, so the sprite stays a picture.
  return (
    <img
      src={waving ? penumblobWave : penumblobStill}
      alt=""
      width={32}
      height={32}
      draggable={false}
      onPointerDown={wave}
      className={className}
      style={{ imageRendering: "pixelated", flexShrink: 0, cursor: "pointer", ...(size != null ? { width: size, height: size } : null), ...style }}
    />
  );
}
