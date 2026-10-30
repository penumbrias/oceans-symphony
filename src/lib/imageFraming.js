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
// - a record's own pictures (an alter's profile picture, bar picture and
//   Pictures; a group's, contact's or location's picture; the system's
//   picture): `image_framing` on that record, a map of picture URL → frame,
//   so a picture is framed the same everywhere it shows (each rotating
//   picture has its own). Since v0.322.0 every record with a picture has it.
// - a profile look's header / background picture: the look's own
//   `_header_image_framing` / `_bg_image_framing` custom field (one frame,
//   for the picture set there) — see PS in profileStyle.js;
// - a picture placed in an Image widget: that item's `frame`;
// - the system banner: `system_banner_framing` on SystemSettings (device
//   look, like its height — the crop differs by screen width).

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

// The style for a picture drawn as a CSS background (a header banner, a
// page background): the layer itself is positioned and scaled, so it needs
// a clipping parent (overflow hidden), which every such layer has.
export function framedBackgroundStyle(frame) {
  const f = framingOf(frame);
  if (!f) return { backgroundSize: "cover", backgroundPosition: "center" };
  const at = `${f.x}% ${f.y}%`;
  return {
    backgroundSize: "cover",
    backgroundPosition: at,
    ...(f.zoom !== 1 ? { transform: `scale(${f.zoom})`, transformOrigin: at } : {}),
  };
}

// The frame a record (alter, group, contact, location, system settings)
// gave one of its pictures.
export function framingFor(record, url) {
  if (!record || !url) return null;
  const map = record.image_framing;
  return map && typeof map === "object" ? framingOf(map[url]) : null;
}

// Style for a record's picture wherever it shows (cards, bars, widgets,
// lists, pickers).
export function pictureStyle(record, url) {
  return framedImageStyle(framingFor(record, url));
}
export const alterPictureStyle = pictureStyle;

// `map` (a record's image_framing) with one picture's frame set, or with
// null, cleared. Pure — for forms that hold the record until Save.
export function withImageFraming(map, url, frame) {
  const out = { ...(map && typeof map === "object" ? map : {}) };
  if (!url) return out;
  const f = framingOf(frame);
  if (f) out[url] = f;
  else delete out[url];
  return out;
}

// Save (or, with null, clear) the frame of one of a record's pictures, on
// a fresh read so the other pictures' frames are kept. `entity` is the
// entity name ("Alter", "Group", "Contact", "InnerWorldLocation",
// "SystemSettings").
export async function setRecordImageFraming(entity, id, url, frame) {
  if (!entity || !id || !url) return null;
  const fresh = (await base44.entities[entity].get(id)) || {};
  return base44.entities[entity].update(id, { image_framing: withImageFraming(fresh.image_framing, url, frame) });
}
export const setAlterImageFraming = (alterId, url, frame) => setRecordImageFraming("Alter", alterId, url, frame);
