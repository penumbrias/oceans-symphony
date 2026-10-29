// Picture framing (v0.314.0): where a picture sits inside the shape that
// shows it, and how far it's zoomed in. Pictures used to be centred and
// cropped to fill, so a face near the top of a photo got cut off in a
// circle — owner report.
//
// A frame is { x, y, zoom }: x / y are the point of the picture (0–100 %,
// left→right, top→bottom) kept in view, zoom is 1 (fills the shape) to 4.
// Drawn with object-fit: cover + object-position at that point, then
// scaled around the same point, so the frame looks the same in any shape
// or size.
//
// Where frames live:
// - an alter's own pictures (profile picture, bar picture, Pictures):
//   Alter.image_framing, a map of picture URL → frame, so a picture is
//   framed the same everywhere it shows (each rotating picture has its own);
// - a picture placed in an Image widget: that item's `frame`.

import { base44 } from "@/api/base44Client";

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const CENTRED = { x: 50, y: 50, zoom: 1 };

const clamp = (v, lo, hi, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
};

// A stored frame, cleaned; null when there's none (centred).
export function framingOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const f = {
    x: clamp(raw.x, 0, 100, 50),
    y: clamp(raw.y, 0, 100, 50),
    zoom: clamp(raw.zoom, ZOOM_MIN, ZOOM_MAX, 1),
  };
  return f.x === 50 && f.y === 50 && f.zoom === 1 ? null : f;
}

// The <img> style for a frame. `fallbackPosition` is an older preset
// ("center top"…) used when there's no frame.
export function framedImageStyle(frame, { fit = "cover", fallbackPosition = "center" } = {}) {
  const f = framingOf(frame);
  if (!f) return { objectFit: fit, objectPosition: fallbackPosition };
  const at = `${f.x}% ${f.y}%`;
  return {
    objectFit: fit,
    objectPosition: at,
    ...(f.zoom !== 1 ? { transform: `scale(${f.zoom})`, transformOrigin: at } : {}),
  };
}

// The frame an alter gave one of their pictures.
export function framingFor(alter, url) {
  if (!alter || !url) return null;
  const map = alter.image_framing;
  return map && typeof map === "object" ? framingOf(map[url]) : null;
}

// Style for an alter's picture wherever it shows (cards, bars, widgets).
export function alterPictureStyle(alter, url) {
  return framedImageStyle(framingFor(alter, url));
}

// Save (or, with null, clear) the frame of one of an alter's pictures, on
// a fresh read so the other pictures' frames are kept.
export async function setAlterImageFraming(alterId, url, frame) {
  if (!alterId || !url) return null;
  const fresh = (await base44.entities.Alter.get(alterId)) || {};
  const map = { ...(fresh.image_framing && typeof fresh.image_framing === "object" ? fresh.image_framing : {}) };
  const f = framingOf(frame);
  if (f) map[url] = f;
  else delete map[url];
  return base44.entities.Alter.update(alterId, { image_framing: map });
}
