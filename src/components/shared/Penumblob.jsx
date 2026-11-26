// Penumblob, the guide (drawn by the owner). One sprite everywhere the app
// speaks as a guide: the Home guide panel, the Tour, "How this page works"
// and "Show me around". Still by default; the two-frame wave plays for a
// moment only when `cue` changes to something new, or when tapped, and never
// when the device asks for reduced motion.
import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { readPixelLook } from "@/lib/pixelLook";
import penumblobStill from "@/assets/penumblob/penumblob.png";
import penumblobWave from "@/assets/penumblob/penumblob-wave.png";

const WAVE_MS = 1400;

function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

// `size` (px or any CSS length) sets the drawn size; leave it off to size it
// from a class instead.
// How the person wants the guide drawn (Settings → Display options → Look →
// Penumblob: Shown · Small · Hidden; SystemSettings.ui_pixel.guide). Hidden
// draws nothing (the words beside it stay); Small draws it at 60%.
export function usePenumblobSize() {
  const { data: list = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  return readPixelLook(pickPrimarySystemSettings(list)).guide || "shown";
}

export default function Penumblob({ cue = null, size: sizeIn, backdrop = true, className = "", style }) {
  const guide = usePenumblobSize();
  const size = guide === "small" && typeof sizeIn === "number" ? Math.round(sizeIn * 0.6) : sizeIn;
  const [waving, setWaving] = useState(false);
  const wave = () => { if (!reducedMotion()) setWaving(true); };
  useEffect(() => { if (cue != null) wave(); }, [cue]);
  useEffect(() => {
    if (!waving) return undefined;
    const t = setTimeout(() => setWaving(false), WAVE_MS);
    return () => clearTimeout(t);
  }, [waving]);
  // A tap is a small hello, not an action, so the sprite stays a picture.
  const img = (
    <img
      src={waving ? penumblobWave : penumblobStill}
      alt=""
      width={32}
      height={32}
      draggable={false}
      onPointerDown={wave}
      className={backdrop ? "" : className}
      style={{ imageRendering: "pixelated", flexShrink: 0, cursor: "pointer", display: "block", ...(size != null ? { width: size, height: size } : { width: "100%", height: "100%" }), ...(backdrop ? null : style) }}
    />
  );
  if (guide === "hidden") return null;
  if (!backdrop) return img;
  // The backdrop: a small light, bevelled pixel tile, so the navy blob reads
  // on dark themes as well as light ones.
  return (
    <span
      className={`penumblob-tile ${className}`}
      data-guide-size={guide === "small" ? "small" : undefined}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        padding: "0.25em", lineHeight: 0,
        background: "radial-gradient(circle at 50% 45%, #eef1ff 0%, #c9d0f2 62%, #aab3e0 100%)",
        border: "2px solid #1b1d33",
        boxShadow: "inset 2px 2px 0 #ffffff, inset -2px -2px 0 #8f98c8",
        ...style,
      }}
    >
      {img}
    </span>
  );
}
