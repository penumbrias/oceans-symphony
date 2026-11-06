// Pictures inside written text (v0.364.0) — the mini toolbar's "Insert
// image". A picture can be framed like a profile picture (drag what stays
// in view, zoom), given a shape, and several pictures can go in at once and
// show one after another, as a carousel (swipe sideways) or as a slideshow.
//
// Everything is plain HTML with inline styles, so it reads the same in every
// renderer the app has (renderRichContent for chat / bulletins / comments,
// the DOMPurify paths for bios, text widgets and journals) and in exports —
// no script runs. The slideshow's fade uses the global `os-slides-<n>`
// keyframes in index.css (2–MAX_SLIDES pictures).
//
// The outer element carries `data-os-pic` (the settings, URI-encoded JSON),
// so the editor can open the same sheet on it again to change it. A plain
// older <img> (inserted before this) is read too, by its src and width.

import { framingOf } from "@/lib/imageFraming";
import { isInkImageClass } from "@/lib/inkDrawing";

export const MAX_SLIDES = 20;

export const SHAPES = [
  { value: "original", label: "As it is", ratio: null },
  { value: "square", label: "Square", ratio: "1 / 1" },
  { value: "wide", label: "Wide", ratio: "4 / 3" },
  { value: "banner", label: "Banner", ratio: "16 / 9" },
  { value: "tall", label: "Tall", ratio: "3 / 4" },
  { value: "circle", label: "Circle", ratio: "1 / 1" },
];
export const LAYOUTS = [
  { value: "inline", label: "One after another" },
  { value: "carousel", label: "Carousel" },
  { value: "slideshow", label: "Slideshow" },
];

export const DEFAULTS = { layout: "inline", shape: "original", width: 100, corners: 8, seconds: 5 };

const num = (v, lo, hi, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fb;
};
const SAFE_SRC = /^(\/local-image\/|local-image:\/\/|https?:|data:image\/)/i;
const escAttr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A picture set, cleaned: unknown values fall back, unsafe sources go.
export function normalizePictureSet(raw = {}) {
  const images = (Array.isArray(raw.images) ? raw.images : [])
    .filter((im) => im && typeof im.src === "string" && SAFE_SRC.test(im.src))
    .map((im) => {
      const frame = framingOf(im.frame);
      return frame ? { src: im.src, frame } : { src: im.src };
    });
  let layout = LAYOUTS.some((l) => l.value === raw.layout) ? raw.layout : DEFAULTS.layout;
  if (images.length < 2) layout = "inline";
  if (layout === "slideshow" && images.length > MAX_SLIDES) layout = "carousel";
  let shape = SHAPES.some((s) => s.value === raw.shape) ? raw.shape : DEFAULTS.shape;
  // A carousel or slideshow needs every picture the same shape.
  if (layout !== "inline" && shape === "original") shape = "wide";
  return {
    images,
    layout,
    shape,
    width: num(raw.width, 10, 100, DEFAULTS.width),
    corners: num(raw.corners, 0, 40, DEFAULTS.corners),
    seconds: num(raw.seconds, 2, 60, DEFAULTS.seconds),
  };
}

// The shapes a layout can use (a carousel or slideshow can't be "as it is").
export function shapesFor(layout) {
  return layout === "inline" ? SHAPES : SHAPES.filter((s) => s.value !== "original");
}

function ratioOf(shape) {
  return SHAPES.find((s) => s.value === shape)?.ratio || null;
}

// The <img> inside a shaped (or zoomed) box: fills the box, framed.
function framedImgCss(frame, { natural = false } = {}) {
  const f = framingOf(frame);
  const at = f ? `${f.x}% ${f.y}%` : "50% 50%";
  return [
    "display:block", "margin:0", "border-radius:0", "max-width:none", "width:100%",
    natural ? "height:auto" : "height:100%",
    "object-fit:cover", `object-position:${at}`,
    ...(f && f.zoom !== 1 ? [`transform:scale(${f.zoom})`, `transform-origin:${at}`] : []),
  ].join(";") + ";";
}

function radiusOf(set) {
  return set.shape === "circle" ? "50%" : `${set.corners}px`;
}

// One picture shown on its own (the "one after another" layout).
function singleHtml(set, im, srcFor, extraAttrs = "") {
  const src = escAttr(srcFor(im.src));
  const width = set.width >= 100 ? "" : `width:${set.width}%;`;
  const ratio = ratioOf(set.shape);
  const framed = !!framingOf(im.frame);
  if (!ratio && !framed) {
    // Exactly what an image inserted before v0.364.0 looks like, plus its
    // corners — plain pictures stay plain markup.
    return `<img src="${src}" alt=""${extraAttrs} style="${width}max-width:100%;height:auto;border-radius:${radiusOf(set)};display:block;margin:6px 0;" />`;
  }
  const box = [
    width || "width:100%;", "max-width:100%;", ratio ? `aspect-ratio:${ratio};` : "",
    "overflow:hidden;", `border-radius:${radiusOf(set)};`, "margin:6px 0;",
  ].join("");
  return `<div${extraAttrs} style="${box}"><img src="${src}" alt="" style="${framedImgCss(im.frame, { natural: !ratio })}" /></div>`;
}

// The HTML a picture set inserts. `srcFor` maps a stored src to the one to
// draw (the sheet's preview passes resolved device URLs; the stored text
// keeps the original).
export function pictureSetHtml(raw, { srcFor = (s) => s, editable = true } = {}) {
  const set = normalizePictureSet(raw);
  if (!set.images.length) return "";
  const data = ` data-os-pic="${escAttr(encodeURIComponent(JSON.stringify(set)))}"${editable ? ' contenteditable="false"' : ""}`;
  if (set.layout === "inline") {
    // Each picture carries the whole set's settings, so tapping any one of
    // them edits it; a set of one is a single picture.
    return set.images.map((im) => {
      const one = { ...set, images: [im] };
      const d = ` data-os-pic="${escAttr(encodeURIComponent(JSON.stringify(one)))}"${editable ? ' contenteditable="false"' : ""}`;
      return singleHtml(set, im, srcFor, d);
    }).join("");
  }
  const ratio = ratioOf(set.shape);
  const radius = radiusOf(set);
  const width = `width:${set.width}%;max-width:100%;`;
  if (set.layout === "carousel") {
    const items = set.images.map((im) => (
      `<div style="flex:0 0 85%;scroll-snap-align:center;aspect-ratio:${ratio};overflow:hidden;border-radius:${radius};">`
      + `<img src="${escAttr(srcFor(im.src))}" alt="" style="${framedImgCss(im.frame)}" /></div>`
    )).join("");
    return `<div data-os-gallery="carousel"${data} style="${width}display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;margin:6px 0;padding-bottom:4px;">${items}</div>`;
  }
  // Slideshow: every picture in one grid cell, faded in turn.
  const n = set.images.length;
  const cycle = n * set.seconds;
  const slides = set.images.map((im, i) => (
    `<div style="grid-area:1 / 1;min-width:0;min-height:0;overflow:hidden;opacity:${i === 0 ? 1 : 0};animation:os-slides-${n} ${cycle}s linear ${i * set.seconds}s infinite;">`
    + `<img src="${escAttr(srcFor(im.src))}" alt="" style="${framedImgCss(im.frame)}" /></div>`
  )).join("");
  return `<div data-os-gallery="slideshow"${data} style="${width}display:grid;aspect-ratio:${ratio};overflow:hidden;border-radius:${radius};margin:6px 0;">${slides}</div>`;
}

// Read a set back off an element in the editor: one carrying data-os-pic,
// or an older plain <img>. Returns { set, el } (el = the element to
// replace) or null.
export function pictureSetFromElement(target) {
  if (!target || target.nodeType !== 1) return null;
  const owner = target.closest?.("[data-os-pic]");
  if (owner) {
    try {
      return { set: normalizePictureSet(JSON.parse(decodeURIComponent(owner.getAttribute("data-os-pic") || ""))), el: owner };
    } catch { /* fall through to the plain-image read */ }
  }
  if (target.tagName !== "IMG") return null;
  if (isInkImageClass(target.getAttribute("class"))) return null; // a drawing, not a picture
  const src = target.getAttribute("src") || "";
  if (!SAFE_SRC.test(src)) return null;
  const m = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(target.getAttribute("style") || "");
  return { set: normalizePictureSet({ images: [{ src }], width: m ? Number(m[1]) : 100 }), el: target };
}

// The keyframes the slideshow uses, one per picture count (n pictures, each
// on screen for 1/n of the loop, fading over the start of the next one's
// turn). Written into index.css; scripts/test-rich-pictures.mjs checks the
// two agree.
export function slideshowKeyframes(n) {
  const slot = 100 / n;
  const fade = Math.min(slot * 0.3, 6);
  const r = (v) => Math.round(v * 1000) / 1000;
  return `@keyframes os-slides-${n}{0%{opacity:0}${r(fade)}%{opacity:1}${r(slot)}%{opacity:1}${r(slot + fade)}%{opacity:0}100%{opacity:0}}`;
}
